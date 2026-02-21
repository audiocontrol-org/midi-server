/**
 * MidiHttpServer - HTTP-to-MIDI bridge server
 *
 * Provides a robust HTTP API for applications to proxy MIDI operations
 * through JUCE, avoiding the limitations of platform MIDI libraries.
 *
 * Uses cpp-httplib for the HTTP server with a thread pool.
 */

#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>
#include <juce_audio_devices/juce_audio_devices.h>

#include "httplib.h"
#include "JsonBuilder.h"
#include "MidiPort.h"
#include "VirtualMidiPort.h"
#include "RouteManager.h"

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>

//==============================================================================
// HTTP Server class
class MidiHttpServer
{
public:
    explicit MidiHttpServer(int port) : serverPort(port), routeManager() {
        // Set up local message forwarder for RouteManager
        routeManager.setLocalMessageForwarder([this](const std::string& destPortId,
                                                      const std::vector<uint8_t>& data) {
            forwardToLocalDestination(destPortId, data);
        });
    }

    ~MidiHttpServer() {
        stopServer();
    }

    // Forward a message to a local destination port (used by RouteManager for local routes)
    void forwardToLocalDestination(const std::string& destPortId,
                                    const std::vector<uint8_t>& data) {
        std::lock_guard<std::mutex> lock(portsMutex);

        // Check if it's a virtual port
        if (destPortId.rfind("virtual:", 0) == 0) {
            std::string virtualId = destPortId.substr(8);
            auto it = virtualPorts.find(virtualId);
            if (it != virtualPorts.end()) {
                it->second->sendMessage(data);
            } else {
                std::cerr << "[RouteManager] Virtual destination not found: "
                          << virtualId << std::endl;
            }
            return;
        }

        // Check physical ports
        auto it = ports.find(destPortId);
        if (it != ports.end()) {
            it->second->sendMessage(data);
        } else {
            std::cerr << "[RouteManager] Destination port not found: "
                      << destPortId << std::endl;
        }
    }

    void startServer() {
        // Auto-open ports referenced by any routes persisted from last run
        autoOpenPortsForAllRoutes();

        server = std::make_unique<httplib::Server>();

        // Add CORS headers to all responses
        server->set_post_routing_handler([](const httplib::Request&, httplib::Response& res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res.set_header("Access-Control-Allow-Headers", "Content-Type");
        });

        // Handle CORS preflight requests
        server->Options(".*", [](const httplib::Request&, httplib::Response& res) {
            res.status = 204;
        });

        // Health check endpoint
        server->Get("/health", [this](const httplib::Request&, httplib::Response& res) {
            JsonBuilder json;
            json.startObject().key("status").value(std::string("ok")).endObject();
            res.set_content(json.toString(), "application/json");
        });

        // List available MIDI ports
        server->Get("/ports", [this](const httplib::Request&, httplib::Response& res) {
            JsonBuilder json;
            json.startObject();

            json.key("inputs").startArray();
            auto inputs = juce::MidiInput::getAvailableDevices();
            for (const auto& device : inputs) {
                json.arrayValue(device.name.toStdString());
            }
            json.endArray();

            json.key("outputs").startArray();
            auto outputs = juce::MidiOutput::getAvailableDevices();
            for (const auto& device : outputs) {
                json.arrayValue(device.name.toStdString());
            }
            json.endArray();

            json.endObject();
            res.set_content(json.toString(), "application/json");
        });

        // Open a MIDI port
        server->Post("/port/:portId", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            try {
                // Parse JSON body (simple parsing)
                std::string name, type;

                size_t namePos = req.body.find("\"name\":\"");
                if (namePos != std::string::npos) {
                    namePos += 8;
                    size_t endPos = req.body.find("\"", namePos);
                    name = req.body.substr(namePos, endPos - namePos);
                }

                size_t typePos = req.body.find("\"type\":\"");
                if (typePos != std::string::npos) {
                    typePos += 8;
                    size_t endPos = req.body.find("\"", typePos);
                    type = req.body.substr(typePos, endPos - typePos);
                }

                bool isInput = (type == "input");
                auto port = std::make_unique<MidiPort>(portId, name, isInput);

                // Set up routing callback for input ports
                if (isInput) {
                    port->setMessageCallback([this](const std::string& srcPortId,
                                                    const std::vector<uint8_t>& data) {
                        routeManager.forwardMessage(srcPortId, data);
                    });
                }

                bool success = port->open();

                if (success) {
                    std::lock_guard<std::mutex> lock(portsMutex);
                    ports[portId] = std::move(port);
                }

                JsonBuilder json;
                json.startObject().key("success").value(success).endObject();
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        // Close a MIDI port
        server->Delete("/port/:portId", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            bool success = ports.erase(portId) > 0;

            JsonBuilder json;
            json.startObject().key("success").value(success).endObject();
            res.set_content(json.toString(), "application/json");
        });

        // Send MIDI message
        server->Post("/port/:portId/send", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            auto it = ports.find(portId);
            if (it == ports.end()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Port not found")).endObject();
                res.status = 404;
                res.set_content(json.toString(), "application/json");
                return;
            }

            try {
                // Parse message array from JSON
                std::vector<uint8_t> message;
                size_t msgPos = req.body.find("\"message\":[");
                if (msgPos != std::string::npos) {
                    msgPos += 11;
                    size_t endPos = req.body.find("]", msgPos);
                    std::string msgStr = req.body.substr(msgPos, endPos - msgPos);

                    std::istringstream iss(msgStr);
                    std::string token;
                    while (std::getline(iss, token, ',')) {
                        if (!token.empty()) {
                            message.push_back((uint8_t)std::stoi(token));
                        }
                    }
                }

                // Validate message before sending
                if (message.empty()) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Invalid MIDI message: empty message"))
                        .key("success").value(false)
                        .endObject();
                    res.status = 400;
                    res.set_content(json.toString(), "application/json");
                    std::cerr << "Rejected empty MIDI message\n";
                    return;
                }

                // Reject incomplete SysEx (single 0xF0 byte)
                if (message.size() == 1 && message[0] == 0xF0) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Invalid MIDI message: incomplete SysEx (0xF0 without 0xF7)"))
                        .key("success").value(false)
                        .endObject();
                    res.status = 400;
                    res.set_content(json.toString(), "application/json");
                    std::cerr << "Rejected incomplete SysEx (single 0xF0)\n";
                    return;
                }

                it->second->sendMessage(message);

                JsonBuilder json;
                json.startObject().key("success").value(true).endObject();
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        // Get queued incoming messages
        server->Get("/port/:portId/messages", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            auto it = ports.find(portId);
            if (it == ports.end()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Port not found")).endObject();
                res.status = 404;
                res.set_content(json.toString(), "application/json");
                return;
            }

            auto messages = it->second->getMessages();

            JsonBuilder json;
            json.startObject().key("messages").startArray();

            for (const auto& msg : messages) {
                json.startArray();
                for (uint8_t byte : msg) {
                    json.arrayValue((int)byte);
                }
                json.endArray();
            }

            json.endArray().endObject();
            res.set_content(json.toString(), "application/json");
        });

        //==============================================================================
        // Virtual MIDI port endpoints (for testing)
        //==============================================================================

        // List virtual ports
        server->Get("/virtual", [this](const httplib::Request&, httplib::Response& res) {
            std::lock_guard<std::mutex> lock(portsMutex);

            JsonBuilder json;
            json.startObject();

            json.key("inputs").startArray();
            for (const auto& [id, port] : virtualPorts) {
                if (port->isInput()) {
                    json.arrayValue(id);
                }
            }
            json.endArray();

            json.key("outputs").startArray();
            for (const auto& [id, port] : virtualPorts) {
                if (!port->isInput()) {
                    json.arrayValue(id);
                }
            }
            json.endArray();

            json.endObject();
            res.set_content(json.toString(), "application/json");
        });

        // Create a virtual port
        server->Post("/virtual/:portId", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            try {
                // Parse JSON body
                std::string name, type;

                size_t namePos = req.body.find("\"name\":\"");
                if (namePos != std::string::npos) {
                    namePos += 8;
                    size_t endPos = req.body.find("\"", namePos);
                    name = req.body.substr(namePos, endPos - namePos);
                } else {
                    name = portId; // Use portId as name if not specified
                }

                size_t typePos = req.body.find("\"type\":\"");
                if (typePos != std::string::npos) {
                    typePos += 8;
                    size_t endPos = req.body.find("\"", typePos);
                    type = req.body.substr(typePos, endPos - typePos);
                }

                bool isInput = (type == "input");
                std::string fullPortId = "virtual:" + portId;
                auto port = std::make_unique<VirtualMidiPort>(fullPortId, name, isInput);

                // Set up routing callback for input ports
                if (isInput) {
                    port->setMessageCallback([this](const std::string& srcPortId,
                                                    const std::vector<uint8_t>& data) {
                        routeManager.forwardMessage(srcPortId, data);
                    });
                }

                bool success = port->open();

                if (success) {
                    std::lock_guard<std::mutex> lock(portsMutex);
                    virtualPorts[portId] = std::move(port);
                }

                JsonBuilder json;
                json.startObject()
                    .key("success").value(success)
                    .key("name").value(name)
                    .key("type").value(type)
                    .endObject();
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        // Delete a virtual port
        server->Delete("/virtual/:portId", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            bool success = virtualPorts.erase(portId) > 0;

            JsonBuilder json;
            json.startObject().key("success").value(success).endObject();
            res.set_content(json.toString(), "application/json");
        });

        // Inject a message into a virtual input port (for testing)
        server->Post("/virtual/:portId/inject", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            auto it = virtualPorts.find(portId);
            if (it == virtualPorts.end()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Virtual port not found")).endObject();
                res.status = 404;
                res.set_content(json.toString(), "application/json");
                return;
            }

            if (!it->second->isInput()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Can only inject into input ports")).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
                return;
            }

            try {
                // Parse message array from JSON
                std::vector<uint8_t> message;
                size_t msgPos = req.body.find("\"message\":[");
                if (msgPos != std::string::npos) {
                    msgPos += 11;
                    size_t endPos = req.body.find("]", msgPos);
                    std::string msgStr = req.body.substr(msgPos, endPos - msgPos);

                    std::istringstream iss(msgStr);
                    std::string token;
                    while (std::getline(iss, token, ',')) {
                        if (!token.empty()) {
                            message.push_back((uint8_t)std::stoi(token));
                        }
                    }
                }

                if (message.empty()) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Empty message"))
                        .key("success").value(false)
                        .endObject();
                    res.status = 400;
                    res.set_content(json.toString(), "application/json");
                    return;
                }

                it->second->injectMessage(message);

                JsonBuilder json;
                json.startObject().key("success").value(true).endObject();
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        // Get messages from a virtual port's queue
        server->Get("/virtual/:portId/messages", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            auto it = virtualPorts.find(portId);
            if (it == virtualPorts.end()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Virtual port not found")).endObject();
                res.status = 404;
                res.set_content(json.toString(), "application/json");
                return;
            }

            auto messages = it->second->getMessages();

            JsonBuilder json;
            json.startObject().key("messages").startArray();

            for (const auto& msg : messages) {
                json.startArray();
                for (uint8_t byte : msg) {
                    json.arrayValue((int)byte);
                }
                json.endArray();
            }

            json.endArray().endObject();
            res.set_content(json.toString(), "application/json");
        });

        // Send through a virtual output port
        server->Post("/virtual/:portId/send", [this](const httplib::Request& req, httplib::Response& res) {
            std::string portId = req.path_params.at("portId");

            std::lock_guard<std::mutex> lock(portsMutex);
            auto it = virtualPorts.find(portId);
            if (it == virtualPorts.end()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Virtual port not found")).endObject();
                res.status = 404;
                res.set_content(json.toString(), "application/json");
                return;
            }

            if (it->second->isInput()) {
                JsonBuilder json;
                json.startObject().key("error").value(std::string("Can only send from output ports")).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
                return;
            }

            try {
                // Parse message array from JSON
                std::vector<uint8_t> message;
                size_t msgPos = req.body.find("\"message\":[");
                if (msgPos != std::string::npos) {
                    msgPos += 11;
                    size_t endPos = req.body.find("]", msgPos);
                    std::string msgStr = req.body.substr(msgPos, endPos - msgPos);

                    std::istringstream iss(msgStr);
                    std::string token;
                    while (std::getline(iss, token, ',')) {
                        if (!token.empty()) {
                            message.push_back((uint8_t)std::stoi(token));
                        }
                    }
                }

                if (message.empty()) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Empty message"))
                        .key("success").value(false)
                        .endObject();
                    res.status = 400;
                    res.set_content(json.toString(), "application/json");
                    return;
                }

                it->second->sendMessage(message);

                JsonBuilder json;
                json.startObject().key("success").value(true).endObject();
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        //==============================================================================
        // Route management endpoints
        //==============================================================================

        // GET /routes - List all routes
        server->Get("/routes", [this](const httplib::Request&, httplib::Response& res) {
            auto routes = routeManager.getAllRoutes();

            JsonBuilder json;
            json.startObject().key("routes").startArray();

            for (const auto& route : routes) {
                json.startObject()
                    .key("id").value(route.id)
                    .key("enabled").value(route.enabled)
                    .key("source").startObject()
                        .key("serverUrl").value(route.source.serverUrl)
                        .key("portId").value(route.source.portId)
                        .key("portName").value(route.source.portName)
                    .endObject()
                    .key("destination").startObject()
                        .key("serverUrl").value(route.destination.serverUrl)
                        .key("portId").value(route.destination.portId)
                        .key("portName").value(route.destination.portName)
                    .endObject()
                    .key("status").startObject()
                        .key("routeId").value(route.id)
                        .key("status").value(route.enabled ? std::string("active") : std::string("disabled"))
                        .key("messagesRouted").value((int)route.messagesForwarded)
                    .endObject()
                .endObject();
            }

            json.endArray().endObject();
            res.set_content(json.toString(), "application/json");
        });

        // POST /routes - Create a new route
        server->Post("/routes", [this](const httplib::Request& req, httplib::Response& res) {
            try {
                // Parse JSON body - expecting source and destination endpoint objects
                RouteEndpoint source, destination;
                bool enabled = true;

                // Parse source endpoint
                size_t sourceStart = req.body.find("\"source\"");
                if (sourceStart != std::string::npos) {
                    source.serverUrl = extractNestedJsonString(req.body, sourceStart, "serverUrl");
                    source.portId = extractNestedJsonString(req.body, sourceStart, "portId");
                    source.portName = extractNestedJsonString(req.body, sourceStart, "portName");
                }

                // Parse destination endpoint
                size_t destStart = req.body.find("\"destination\"");
                if (destStart != std::string::npos) {
                    destination.serverUrl = extractNestedJsonString(req.body, destStart, "serverUrl");
                    destination.portId = extractNestedJsonString(req.body, destStart, "portId");
                    destination.portName = extractNestedJsonString(req.body, destStart, "portName");
                }

                // Parse enabled (optional, defaults to true)
                size_t enabledPos = req.body.find("\"enabled\":");
                if (enabledPos != std::string::npos) {
                    enabledPos += 10;
                    while (enabledPos < req.body.length() &&
                           (req.body[enabledPos] == ' ' || req.body[enabledPos] == '\t')) {
                        enabledPos++;
                    }
                    enabled = (req.body.substr(enabledPos, 4) == "true");
                }

                // Parse id (optional, allows pre-specified ID for cross-server replication)
                std::string prespecifiedId;
                size_t idPos = req.body.find("\"id\":\"");
                if (idPos != std::string::npos) {
                    idPos += 6;
                    size_t idEnd = req.body.find("\"", idPos);
                    if (idEnd != std::string::npos) {
                        prespecifiedId = req.body.substr(idPos, idEnd - idPos);
                    }
                }

                if (source.portId.empty() || destination.portId.empty()) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Missing source.portId or destination.portId"))
                        .endObject();
                    res.status = 400;
                    res.set_content(json.toString(), "application/json");
                    return;
                }

                std::string routeId = routeManager.addRoute(source, destination, enabled, prespecifiedId);

                // Auto-open any local physical ports the route references
                autoOpenPortsForRoute(source, destination);

                JsonBuilder json;
                json.startObject()
                    .key("route").startObject()
                        .key("id").value(routeId)
                        .key("enabled").value(enabled)
                        .key("source").startObject()
                            .key("serverUrl").value(source.serverUrl)
                            .key("portId").value(source.portId)
                            .key("portName").value(source.portName)
                        .endObject()
                        .key("destination").startObject()
                            .key("serverUrl").value(destination.serverUrl)
                            .key("portId").value(destination.portId)
                            .key("portName").value(destination.portName)
                        .endObject()
                    .endObject()
                .endObject();
                res.status = 201;
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        // PUT /routes/:routeId - Update a route (enable/disable)
        server->Put("/routes/:routeId", [this](const httplib::Request& req, httplib::Response& res) {
            std::string routeId = req.path_params.at("routeId");

            try {
                // Parse enabled field
                size_t enabledPos = req.body.find("\"enabled\":");
                if (enabledPos == std::string::npos) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Missing enabled field"))
                        .endObject();
                    res.status = 400;
                    res.set_content(json.toString(), "application/json");
                    return;
                }

                enabledPos += 10;
                while (enabledPos < req.body.length() &&
                       (req.body[enabledPos] == ' ' || req.body[enabledPos] == '\t')) {
                    enabledPos++;
                }
                bool enabled = (req.body.substr(enabledPos, 4) == "true");

                bool success = routeManager.setRouteEnabled(routeId, enabled);
                if (!success) {
                    JsonBuilder json;
                    json.startObject()
                        .key("error").value(std::string("Route not found"))
                        .endObject();
                    res.status = 404;
                    res.set_content(json.toString(), "application/json");
                    return;
                }

                JsonBuilder json;
                json.startObject()
                    .key("success").value(true)
                    .key("routeId").value(routeId)
                    .key("enabled").value(enabled)
                    .endObject();
                res.set_content(json.toString(), "application/json");
            } catch (const std::exception& e) {
                JsonBuilder json;
                json.startObject().key("error").value(e.what()).endObject();
                res.status = 400;
                res.set_content(json.toString(), "application/json");
            }
        });

        // DELETE /routes/:routeId - Delete a route
        server->Delete("/routes/:routeId", [this](const httplib::Request& req, httplib::Response& res) {
            std::string routeId = req.path_params.at("routeId");

            bool success = routeManager.removeRoute(routeId);
            if (!success) {
                JsonBuilder json;
                json.startObject()
                    .key("error").value(std::string("Route not found"))
                    .endObject();
                res.status = 404;
                res.set_content(json.toString(), "application/json");
                return;
            }

            JsonBuilder json;
            json.startObject().key("success").value(true).endObject();
            res.set_content(json.toString(), "application/json");
        });

        // Start server in a separate thread
        serverThread = std::thread([this]() {
            if (serverPort == 0) {
                // Let OS assign an available port
                int actualPort = server->bind_to_any_port("0.0.0.0");
                serverPort = actualPort;
                // Print in parseable format for ProcessManager
                std::cout << "MIDI_SERVER_PORT=" << actualPort << std::endl;
                std::cout << "HTTP Server listening on port " << actualPort << std::endl;
                server->listen_after_bind();
            } else {
                std::cout << "MIDI_SERVER_PORT=" << serverPort << std::endl;
                std::cout << "HTTP Server listening on port " << serverPort << std::endl;
                server->listen("0.0.0.0", serverPort);
            }
        });
    }

    void stopServer() {
        if (server) {
            server->stop();
        }
        if (serverThread.joinable()) {
            serverThread.join();
        }

        std::lock_guard<std::mutex> lock(portsMutex);
        ports.clear();
        virtualPorts.clear();
    }

private:
    int serverPort;
    std::unique_ptr<httplib::Server> server;
    std::thread serverThread;
    std::map<std::string, std::unique_ptr<MidiPort>> ports;
    std::map<std::string, std::unique_ptr<VirtualMidiPort>> virtualPorts;
    std::mutex portsMutex;
    RouteManager routeManager;

    // Returns true if the endpoint is a local physical port (not virtual, not remote)
    static bool isLocalPhysical(const std::string& serverUrl, const std::string& portId) {
        return (serverUrl.empty() || serverUrl == "local") &&
               portId.rfind("virtual:", 0) == std::string::npos;
    }

    // Ensures a local physical port is open, opening it if needed.
    // isInput is inferred from portId prefix ("input-" = true, "output-" = false).
    void ensureLocalPortOpen(const std::string& portId, const std::string& portName) {
        {
            std::lock_guard<std::mutex> lock(portsMutex);
            if (ports.find(portId) != ports.end()) return;
        }

        bool isInput = (portId.rfind("input-", 0) == 0);
        auto port = std::make_unique<MidiPort>(portId, portName, isInput);

        if (isInput) {
            port->setMessageCallback([this](const std::string& srcPortId,
                                            const std::vector<uint8_t>& data) {
                routeManager.forwardMessage(srcPortId, data);
            });
        }

        bool success = port->open();
        if (success) {
            std::lock_guard<std::mutex> lock(portsMutex);
            ports[portId] = std::move(port);
            std::cout << "[MidiHttpServer] Auto-opened " << (isInput ? "input" : "output")
                      << " port: " << portName << std::endl;
        } else {
            std::cerr << "[MidiHttpServer] Failed to auto-open port: "
                      << portName << std::endl;
        }
    }

    // Auto-opens any local physical ports referenced by a route's endpoints.
    void autoOpenPortsForRoute(const RouteEndpoint& source, const RouteEndpoint& destination) {
        if (isLocalPhysical(source.serverUrl, source.portId) && !source.portName.empty()) {
            ensureLocalPortOpen(source.portId, source.portName);
        }
        if (isLocalPhysical(destination.serverUrl, destination.portId) && !destination.portName.empty()) {
            ensureLocalPortOpen(destination.portId, destination.portName);
        }
    }

    // Auto-opens ports for all persisted routes (called at startup).
    void autoOpenPortsForAllRoutes() {
        auto routes = routeManager.getAllRoutes();
        for (const auto& route : routes) {
            autoOpenPortsForRoute(route.source, route.destination);
        }
    }

    // Helper to extract a string value from a nested JSON object
    static std::string extractNestedJsonString(const std::string& json,
                                                size_t objectStart,
                                                const std::string& key) {
        // Find the opening brace after objectStart
        size_t braceStart = json.find('{', objectStart);
        if (braceStart == std::string::npos) return "";

        // Find matching closing brace
        int braceCount = 1;
        size_t braceEnd = braceStart + 1;
        while (braceEnd < json.length() && braceCount > 0) {
            if (json[braceEnd] == '{') braceCount++;
            else if (json[braceEnd] == '}') braceCount--;
            braceEnd++;
        }
        if (braceCount != 0) return "";

        std::string objStr = json.substr(braceStart, braceEnd - braceStart);

        // Find the key within this object
        std::string searchKey = "\"" + key + "\":";
        size_t keyPos = objStr.find(searchKey);
        if (keyPos == std::string::npos) {
            searchKey = "\"" + key + "\": ";
            keyPos = objStr.find(searchKey);
            if (keyPos == std::string::npos) return "";
        }

        size_t valueStart = objStr.find('"', keyPos + searchKey.length());
        if (valueStart == std::string::npos) return "";

        size_t valueEnd = objStr.find('"', valueStart + 1);
        if (valueEnd == std::string::npos) return "";

        return objStr.substr(valueStart + 1, valueEnd - valueStart - 1);
    }
};

//==============================================================================
int main(int argc, char* argv[])
{
    // Parse port from command line
    int port = 7777;
    if (argc > 1) {
        port = std::atoi(argv[1]);
    }

    // Initialize JUCE
    juce::ScopedJuceInitialiser_GUI juceInit;

    std::cout << "\nMIDI HTTP Server" << std::endl;
    std::cout << "================" << std::endl;
    std::cout << "Starting server on port " << port << "..." << std::endl;

    MidiHttpServer server(port);
    server.startServer();

    std::cout << "Server running. Press Ctrl+C to stop..." << std::endl;

    // Run until interrupted
    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    return 0;
}

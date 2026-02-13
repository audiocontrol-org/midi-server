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
    explicit MidiHttpServer(int port) : serverPort(port) {}

    ~MidiHttpServer() {
        stopServer();
    }

    void startServer() {
        server = std::make_unique<httplib::Server>();

        // Add CORS headers to all responses
        server->set_post_routing_handler([](const httplib::Request&, httplib::Response& res) {
            res.set_header("Access-Control-Allow-Origin", "*");
            res.set_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
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

        // Start server in a separate thread
        serverThread = std::thread([this]() {
            std::cout << "HTTP Server listening on port " << serverPort << std::endl;
            server->listen("0.0.0.0", serverPort);
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
    }

private:
    int serverPort;
    std::unique_ptr<httplib::Server> server;
    std::thread serverThread;
    std::map<std::string, std::unique_ptr<MidiPort>> ports;
    std::mutex portsMutex;
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

/**
 * RouteManager - Native MIDI message routing with cross-server support
 *
 * Manages MIDI routes in C++ for sub-millisecond local message forwarding
 * and HTTP-based forwarding for remote servers.
 *
 * Thread-safe: All operations are mutex-protected as callbacks
 * run on JUCE MIDI threads.
 */

#pragma once

#include "httplib.h"

#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <ctime>
#include <fstream>
#include <functional>
#include <iostream>
#include <map>
#include <mutex>
#include <queue>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#ifdef _WIN32
#include <shlobj.h>
#include <windows.h>
#else
#include <pwd.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

struct RouteEndpoint {
    std::string serverUrl;  // "local" for local server, or "http://host:port"
    std::string portId;     // e.g., "input-0", "virtual:abc123"
    std::string portName;   // Human-readable name
};

struct MidiRoute {
    std::string id;
    bool enabled;
    RouteEndpoint source;
    RouteEndpoint destination;
    uint64_t messagesForwarded;
};

// Callback type for sending messages to local destination ports
using LocalMessageForwarder = std::function<void(const std::string& destPortId,
                                                  const std::vector<uint8_t>& data)>;

/**
 * RemoteForwarder - Persistent-connection HTTP forwarder for a single remote host.
 *
 * Maintains one TCP connection and one worker thread per remote MIDI server.
 * Messages are queued and sent in order, eliminating per-message TCP handshake
 * overhead and preventing out-of-order delivery.
 */
class RemoteForwarder {
public:
    RemoteForwarder(const std::string& host, int port)
        : client(host, port), running(true) {
        client.set_connection_timeout(1, 0);
        client.set_read_timeout(2, 0);
        client.set_keep_alive(true);
        workerThread = std::thread([this]() { run(); });
    }

    ~RemoteForwarder() {
        {
            std::lock_guard<std::mutex> lock(queueMutex);
            running = false;
        }
        cv.notify_one();
        if (workerThread.joinable()) workerThread.join();
    }

    // Thread-safe: enqueue a message for delivery. Returns immediately.
    void send(const std::string& path, const std::string& body) {
        {
            std::lock_guard<std::mutex> lock(queueMutex);
            pendingQueue.push({path, body});
        }
        cv.notify_one();
    }

private:
    struct PendingMessage {
        std::string path;
        std::string body;
    };

    void run() {
        while (true) {
            PendingMessage msg;
            {
                std::unique_lock<std::mutex> lock(queueMutex);
                cv.wait(lock, [this] { return !pendingQueue.empty() || !running; });
                if (!running && pendingQueue.empty()) return;
                msg = std::move(pendingQueue.front());
                pendingQueue.pop();
            }
            try {
                auto res = client.Post(msg.path, msg.body, "application/json");
                if (!res || res->status != 200) {
                    std::cerr << "[RouteManager] Remote forward failed: "
                              << (res ? std::to_string(res->status) : "connection failed")
                              << std::endl;
                }
            } catch (const std::exception& e) {
                std::cerr << "[RouteManager] Remote forward exception: " << e.what() << std::endl;
            }
        }
    }

    httplib::Client client;
    std::queue<PendingMessage> pendingQueue;
    std::mutex queueMutex;
    std::condition_variable cv;
    std::thread workerThread;
    bool running;
};

class RouteManager {
public:
    explicit RouteManager(const std::string& configPath = "")
        : configFilePath(configPath.empty() ? getDefaultConfigPath() : configPath) {
        loadFromDisk();
    }

    void setLocalMessageForwarder(LocalMessageForwarder forwarder) {
        std::lock_guard<std::mutex> lock(routesMutex);
        localForwarder = std::move(forwarder);
    }

    std::string addRoute(const RouteEndpoint& source,
                         const RouteEndpoint& destination,
                         bool enabled = true,
                         const std::string& prespecifiedId = "") {
        std::lock_guard<std::mutex> lock(routesMutex);

        MidiRoute route;
        route.id = prespecifiedId.empty() ? generateRouteId() : prespecifiedId;
        route.source = source;
        route.destination = destination;
        route.enabled = enabled;
        route.messagesForwarded = 0;

        routes[route.id] = route;
        saveToDiskUnlocked();

        std::cout << "[RouteManager] Added route " << route.id
                  << ": " << source.serverUrl << ":" << source.portId
                  << " -> " << destination.serverUrl << ":" << destination.portId << std::endl;

        return route.id;
    }

    bool removeRoute(const std::string& routeId) {
        std::lock_guard<std::mutex> lock(routesMutex);

        auto it = routes.find(routeId);
        if (it == routes.end()) {
            return false;
        }

        routes.erase(it);
        saveToDiskUnlocked();

        std::cout << "[RouteManager] Removed route " << routeId << std::endl;
        return true;
    }

    bool setRouteEnabled(const std::string& routeId, bool enabled) {
        std::lock_guard<std::mutex> lock(routesMutex);

        auto it = routes.find(routeId);
        if (it == routes.end()) {
            return false;
        }

        it->second.enabled = enabled;
        saveToDiskUnlocked();

        std::cout << "[RouteManager] Route " << routeId
                  << " enabled=" << (enabled ? "true" : "false") << std::endl;
        return true;
    }

    // Get all enabled routes for a given source - called from MIDI callback
    std::vector<MidiRoute> getRoutesForSource(const std::string& sourcePortId) {
        std::lock_guard<std::mutex> lock(routesMutex);

        std::vector<MidiRoute> result;
        for (const auto& [id, route] : routes) {
            if (route.enabled && route.source.portId == sourcePortId) {
                result.push_back(route);
            }
        }
        return result;
    }

    std::vector<MidiRoute> getAllRoutes() {
        std::lock_guard<std::mutex> lock(routesMutex);

        std::vector<MidiRoute> result;
        result.reserve(routes.size());
        for (const auto& [id, route] : routes) {
            result.push_back(route);
        }
        return result;
    }

    MidiRoute* getRoute(const std::string& routeId) {
        std::lock_guard<std::mutex> lock(routesMutex);

        auto it = routes.find(routeId);
        if (it == routes.end()) {
            return nullptr;
        }
        return &it->second;
    }

    // Called from MIDI input callback to forward message through routes
    void forwardMessage(const std::string& sourcePortId,
                        const std::vector<uint8_t>& data) {
        // Get matching routes (lock acquired inside)
        auto matchingRoutes = getRoutesForSource(sourcePortId);

        if (matchingRoutes.empty()) {
            return;
        }

        // Get local forwarder
        LocalMessageForwarder forwarder;
        {
            std::lock_guard<std::mutex> lock(routesMutex);
            forwarder = localForwarder;
        }

        // Forward to each destination
        for (auto& route : matchingRoutes) {
            forwardToDestination(route, data, forwarder);

            // Update message count
            {
                std::lock_guard<std::mutex> lock(routesMutex);
                auto it = routes.find(route.id);
                if (it != routes.end()) {
                    it->second.messagesForwarded++;
                }
            }
        }
    }

    void loadFromDisk() {
        std::lock_guard<std::mutex> lock(routesMutex);

        std::ifstream file(configFilePath);
        if (!file.is_open()) {
            std::cout << "[RouteManager] No routes file found at "
                      << configFilePath << std::endl;
            return;
        }

        std::stringstream buffer;
        buffer << file.rdbuf();
        std::string content = buffer.str();
        file.close();

        // Simple JSON parsing for routes array
        routes.clear();

        size_t routesStart = content.find("\"routes\"");
        if (routesStart == std::string::npos) {
            return;
        }

        size_t arrayStart = content.find('[', routesStart);
        if (arrayStart == std::string::npos) {
            return;
        }

        // Parse each route object
        size_t pos = arrayStart;
        while (true) {
            size_t objStart = content.find('{', pos);
            if (objStart == std::string::npos) break;

            // Find matching closing brace (handle nested objects)
            int braceCount = 1;
            size_t objEnd = objStart + 1;
            while (objEnd < content.length() && braceCount > 0) {
                if (content[objEnd] == '{') braceCount++;
                else if (content[objEnd] == '}') braceCount--;
                objEnd++;
            }
            if (braceCount != 0) break;

            std::string objStr = content.substr(objStart, objEnd - objStart);

            MidiRoute route;
            route.id = extractJsonString(objStr, "id");
            route.enabled = extractJsonBool(objStr, "enabled");
            route.messagesForwarded = 0;

            // Parse source endpoint
            size_t sourceStart = objStr.find("\"source\"");
            if (sourceStart != std::string::npos) {
                size_t srcObjStart = objStr.find('{', sourceStart);
                size_t srcObjEnd = objStr.find('}', srcObjStart);
                if (srcObjStart != std::string::npos && srcObjEnd != std::string::npos) {
                    std::string srcStr = objStr.substr(srcObjStart, srcObjEnd - srcObjStart + 1);
                    route.source.serverUrl = extractJsonString(srcStr, "serverUrl");
                    route.source.portId = extractJsonString(srcStr, "portId");
                    route.source.portName = extractJsonString(srcStr, "portName");
                }
            }

            // Parse destination endpoint
            size_t destStart = objStr.find("\"destination\"");
            if (destStart != std::string::npos) {
                size_t destObjStart = objStr.find('{', destStart);
                size_t destObjEnd = objStr.find('}', destObjStart);
                if (destObjStart != std::string::npos && destObjEnd != std::string::npos) {
                    std::string destStr = objStr.substr(destObjStart, destObjEnd - destObjStart + 1);
                    route.destination.serverUrl = extractJsonString(destStr, "serverUrl");
                    route.destination.portId = extractJsonString(destStr, "portId");
                    route.destination.portName = extractJsonString(destStr, "portName");
                }
            }

            if (!route.id.empty() && !route.source.portId.empty() && !route.destination.portId.empty()) {
                routes[route.id] = route;
            }

            pos = objEnd;
        }

        std::cout << "[RouteManager] Loaded " << routes.size()
                  << " routes from " << configFilePath << std::endl;
    }

    void saveToDisk() {
        std::lock_guard<std::mutex> lock(routesMutex);
        saveToDiskUnlocked();
    }

private:
    std::string configFilePath;
    std::map<std::string, MidiRoute> routes;
    std::mutex routesMutex;
    LocalMessageForwarder localForwarder;

    // Persistent forwarder per remote host:port — created on first use
    std::map<std::string, std::unique_ptr<RemoteForwarder>> forwarders;
    std::mutex forwardersMutex;

    RemoteForwarder& getForwarder(const std::string& host, int port) {
        std::string key = host + ":" + std::to_string(port);
        std::lock_guard<std::mutex> lock(forwardersMutex);
        auto it = forwarders.find(key);
        if (it == forwarders.end()) {
            forwarders[key] = std::make_unique<RemoteForwarder>(host, port);
            std::cout << "[RouteManager] Created persistent forwarder to "
                      << host << ":" << port << std::endl;
            return *forwarders[key];
        }
        return *it->second;
    }

    void forwardToDestination(const MidiRoute& route,
                               const std::vector<uint8_t>& data,
                               const LocalMessageForwarder& forwarder) {
        const auto& dest = route.destination;

        if (isLocalDestination(dest.serverUrl)) {
            // Local forwarding - sub-millisecond
            if (forwarder) {
                forwarder(dest.portId, data);
            } else {
                std::cerr << "[RouteManager] No local forwarder set" << std::endl;
            }
        } else {
            // Remote forwarding via HTTP
            forwardToRemoteServer(dest, data);
        }
    }

    bool isLocalDestination(const std::string& serverUrl) {
        return serverUrl.empty() || serverUrl == "local";
    }

    void forwardToRemoteServer(const RouteEndpoint& dest,
                                const std::vector<uint8_t>& data) {
        // Parse host and port from serverUrl
        // Expected format: "http://host:port" or "http://host:port/path"
        std::string url = dest.serverUrl;

        // Remove http:// prefix
        if (url.rfind("http://", 0) == 0) {
            url = url.substr(7);
        }

        // Split host:port
        std::string host;
        int port = 80;
        size_t colonPos = url.find(':');
        size_t slashPos = url.find('/');

        if (colonPos != std::string::npos) {
            host = url.substr(0, colonPos);
            size_t portEnd = (slashPos != std::string::npos) ? slashPos : url.length();
            port = std::stoi(url.substr(colonPos + 1, portEnd - colonPos - 1));
        } else {
            host = (slashPos != std::string::npos) ? url.substr(0, slashPos) : url;
        }

        // Build the path based on whether it's a virtual port
        std::string path;
        if (dest.portId.rfind("virtual:", 0) == 0) {
            // Virtual port: /virtual/{id}/send
            std::string virtualId = dest.portId.substr(8);
            path = "/virtual/" + virtualId + "/send";
        } else {
            // Physical port: /port/{id}/send
            path = "/port/" + dest.portId + "/send";
        }

        // Build JSON body with message array
        std::stringstream body;
        body << "{\"message\":[";
        for (size_t i = 0; i < data.size(); i++) {
            if (i > 0) body << ",";
            body << (int)data[i];
        }
        body << "]}";

        std::cout << "[RouteManager] Forwarding " << data.size() << " bytes to "
                  << host << ":" << port << path << std::endl;

        // Enqueue on the persistent per-destination forwarder (non-blocking)
        getForwarder(host, port).send(path, body.str());
    }

    void saveToDiskUnlocked() {
        // Ensure directory exists
        ensureDirectoryExists(getDirectoryPath(configFilePath));

        std::ofstream file(configFilePath);
        if (!file.is_open()) {
            std::cerr << "[RouteManager] Failed to save routes to "
                      << configFilePath << std::endl;
            return;
        }

        // Build JSON manually
        file << "{\n  \"routes\": [\n";

        bool first = true;
        for (const auto& [id, route] : routes) {
            if (!first) file << ",\n";
            first = false;

            file << "    {\n";
            file << "      \"id\": \"" << escapeJson(route.id) << "\",\n";
            file << "      \"enabled\": " << (route.enabled ? "true" : "false") << ",\n";
            file << "      \"source\": {\n";
            file << "        \"serverUrl\": \"" << escapeJson(route.source.serverUrl) << "\",\n";
            file << "        \"portId\": \"" << escapeJson(route.source.portId) << "\",\n";
            file << "        \"portName\": \"" << escapeJson(route.source.portName) << "\"\n";
            file << "      },\n";
            file << "      \"destination\": {\n";
            file << "        \"serverUrl\": \"" << escapeJson(route.destination.serverUrl) << "\",\n";
            file << "        \"portId\": \"" << escapeJson(route.destination.portId) << "\",\n";
            file << "        \"portName\": \"" << escapeJson(route.destination.portName) << "\"\n";
            file << "      }\n";
            file << "    }";
        }

        file << "\n  ]\n}\n";
        file.close();
    }

    static std::string escapeJson(const std::string& s) {
        std::string result;
        for (char c : s) {
            switch (c) {
                case '"': result += "\\\""; break;
                case '\\': result += "\\\\"; break;
                case '\n': result += "\\n"; break;
                case '\r': result += "\\r"; break;
                case '\t': result += "\\t"; break;
                default: result += c;
            }
        }
        return result;
    }

    static std::string getDefaultConfigPath() {
        std::string homeDir;

#ifdef _WIN32
        char path[MAX_PATH];
        if (SHGetFolderPathA(NULL, CSIDL_PROFILE, NULL, 0, path) == S_OK) {
            homeDir = path;
        }
        std::string configDir = homeDir + "\\.config\\audiocontrol.org\\midi-server";
#else
        const char* home = getenv("HOME");
        if (!home) {
            struct passwd* pw = getpwuid(getuid());
            if (pw) home = pw->pw_dir;
        }
        homeDir = home ? home : "/tmp";
        std::string configDir = homeDir + "/.config/audiocontrol.org/midi-server";
#endif

        return configDir + "/routes.json";
    }

    static std::string getDirectoryPath(const std::string& filePath) {
        size_t pos = filePath.find_last_of("/\\");
        if (pos == std::string::npos) {
            return ".";
        }
        return filePath.substr(0, pos);
    }

    static void ensureDirectoryExists(const std::string& path) {
#ifdef _WIN32
        // Create directories recursively on Windows
        std::string current;
        for (char c : path) {
            current += c;
            if (c == '/' || c == '\\') {
                CreateDirectoryA(current.c_str(), NULL);
            }
        }
        CreateDirectoryA(path.c_str(), NULL);
#else
        // Use mkdir with recursive flag
        std::string cmd = "mkdir -p \"" + path + "\"";
        system(cmd.c_str());
#endif
    }

    static std::string generateRouteId() {
        // Generate a unique ID: route-{timestamp}-{random}
        auto now = std::time(nullptr);
        std::stringstream ss;
        ss << "route-" << now << "-";

        static const char chars[] = "abcdefghijklmnopqrstuvwxyz0123456789";
        for (int i = 0; i < 7; i++) {
            ss << chars[rand() % (sizeof(chars) - 1)];
        }

        return ss.str();
    }

    static std::string extractJsonString(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\":";
        size_t keyPos = json.find(searchKey);
        if (keyPos == std::string::npos) {
            // Try with space after colon
            searchKey = "\"" + key + "\": ";
            keyPos = json.find(searchKey);
            if (keyPos == std::string::npos) return "";
        }

        size_t valueStart = json.find('"', keyPos + searchKey.length());
        if (valueStart == std::string::npos) return "";

        size_t valueEnd = json.find('"', valueStart + 1);
        if (valueEnd == std::string::npos) return "";

        return json.substr(valueStart + 1, valueEnd - valueStart - 1);
    }

    static bool extractJsonBool(const std::string& json, const std::string& key) {
        std::string searchKey = "\"" + key + "\":";
        size_t keyPos = json.find(searchKey);
        if (keyPos == std::string::npos) {
            searchKey = "\"" + key + "\": ";
            keyPos = json.find(searchKey);
            if (keyPos == std::string::npos) return false;
        }

        size_t valueStart = keyPos + searchKey.length();
        // Skip whitespace
        while (valueStart < json.length() && (json[valueStart] == ' ' || json[valueStart] == '\t')) {
            valueStart++;
        }

        return json.substr(valueStart, 4) == "true";
    }
};

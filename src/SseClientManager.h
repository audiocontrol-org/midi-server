/**
 * SseClientManager - Manages Server-Sent Events clients for MIDI message streaming
 *
 * Thread-safe management of SSE client connections. Each client subscribes to
 * a specific MIDI port and receives real-time events when messages arrive.
 */

#pragma once

#include <atomic>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <vector>

/**
 * SseClient - Represents a single SSE client connection
 *
 * Each client has a message queue that MIDI callbacks push to,
 * and the SSE content provider pulls from.
 */
class SseClient {
public:
    explicit SseClient(const std::string& portId)
        : portId_(portId), active_(true) {}

    ~SseClient() {
        close();
    }

    // Push a MIDI message to this client's queue (called from MIDI thread)
    void pushMessage(const std::vector<uint8_t>& message) {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            if (!active_) return;
            messageQueue_.push(message);
        }
        cv_.notify_one();
    }

    // Wait for and pop the next message (called from HTTP thread)
    // Returns false if client was closed
    bool waitForMessage(std::vector<uint8_t>& message, int timeoutMs = 1000) {
        std::unique_lock<std::mutex> lock(mutex_);

        // Wait for message or timeout
        bool hasMessage = cv_.wait_for(lock, std::chrono::milliseconds(timeoutMs),
            [this] { return !messageQueue_.empty() || !active_; });

        if (!active_) return false;
        if (!hasMessage || messageQueue_.empty()) return false;

        message = std::move(messageQueue_.front());
        messageQueue_.pop();
        return true;
    }

    // Check if client is still active
    bool isActive() const {
        return active_.load();
    }

    // Close the client (signals waiters to exit)
    void close() {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            active_ = false;
        }
        cv_.notify_all();
    }

    const std::string& getPortId() const { return portId_; }

private:
    std::string portId_;
    std::atomic<bool> active_;
    std::queue<std::vector<uint8_t>> messageQueue_;
    std::mutex mutex_;
    std::condition_variable cv_;
};

/**
 * SseClientManager - Manages all SSE client connections
 *
 * Provides thread-safe registration/unregistration of clients
 * and message broadcasting to subscribed clients.
 */
class SseClientManager {
public:
    using ClientId = uint64_t;

    SseClientManager() : nextClientId_(1) {}

    // Register a new SSE client for a port
    // Returns a shared_ptr to the client (caller holds reference)
    std::pair<ClientId, std::shared_ptr<SseClient>> registerClient(const std::string& portId) {
        std::lock_guard<std::mutex> lock(mutex_);

        ClientId id = nextClientId_++;
        auto client = std::make_shared<SseClient>(portId);
        clients_[id] = client;

        std::cout << "[SSE] Client " << id << " registered for port: " << portId << std::endl;
        return {id, client};
    }

    // Unregister a client
    void unregisterClient(ClientId id) {
        std::lock_guard<std::mutex> lock(mutex_);

        auto it = clients_.find(id);
        if (it != clients_.end()) {
            it->second->close();
            clients_.erase(it);
            std::cout << "[SSE] Client " << id << " unregistered" << std::endl;
        }
    }

    // Broadcast a MIDI message to all clients subscribed to a port
    void broadcast(const std::string& portId, const std::vector<uint8_t>& message) {
        std::lock_guard<std::mutex> lock(mutex_);

        for (auto& [id, client] : clients_) {
            if (client->getPortId() == portId && client->isActive()) {
                client->pushMessage(message);
            }
        }
    }

    // Get count of active clients for a port
    size_t getClientCount(const std::string& portId) const {
        std::lock_guard<std::mutex> lock(mutex_);

        size_t count = 0;
        for (const auto& [id, client] : clients_) {
            if (client->getPortId() == portId && client->isActive()) {
                count++;
            }
        }
        return count;
    }

private:
    mutable std::mutex mutex_;
    std::map<ClientId, std::shared_ptr<SseClient>> clients_;
    std::atomic<ClientId> nextClientId_;
};

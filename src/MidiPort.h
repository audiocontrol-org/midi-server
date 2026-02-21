/**
 * MidiPort - Thread-safe MIDI port abstraction
 *
 * Wraps JUCE MIDI input/output with:
 * - Thread-safe message queuing for incoming messages
 * - SysEx fragment buffering (handles split messages)
 * - Simple send API for outgoing messages
 * - Callback support for native routing
 */

#pragma once

#include <juce_audio_devices/juce_audio_devices.h>

#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <queue>
#include <string>
#include <vector>

// Callback type for message routing
using MidiMessageCallback = std::function<void(const std::string& portId,
                                               const std::vector<uint8_t>& data)>;

class MidiPort : public juce::MidiInputCallback
{
public:
    MidiPort(const std::string& id, const std::string& name, bool isInput)
        : portId(id), portName(name), isInputPort(isInput) {}

    // Set callback for incoming messages (for routing)
    void setMessageCallback(MidiMessageCallback callback) {
        std::lock_guard<std::mutex> lock(callbackMutex);
        messageCallback = std::move(callback);
    }

    const std::string& getPortId() const { return portId; }

    ~MidiPort() override { close(); }

    bool open() {
        if (isInputPort) {
            auto devices = juce::MidiInput::getAvailableDevices();
            for (const auto& device : devices) {
                if (device.name.toStdString().find(portName) != std::string::npos) {
                    input = juce::MidiInput::openDevice(device.identifier, this);
                    if (input) {
                        input->start();
                        return true;
                    }
                }
            }
        } else {
            auto devices = juce::MidiOutput::getAvailableDevices();
            for (const auto& device : devices) {
                if (device.name.toStdString().find(portName) != std::string::npos) {
                    output = juce::MidiOutput::openDevice(device.identifier);
                    return output != nullptr;
                }
            }
        }
        return false;
    }

    void close() {
        if (input) {
            input->stop();
            input.reset();
        }
        output.reset();
    }

    void sendMessage(const std::vector<uint8_t>& data) {
        std::cout << "[MidiPort] sendMessage() portId=" << portId
                  << " output=" << (output ? "valid" : "NULL")
                  << " bytes=" << data.size();
        if (!data.empty()) {
            std::cout << " [";
            for (size_t i = 0; i < std::min(data.size(), (size_t)6); i++) {
                if (i > 0) std::cout << " ";
                std::cout << std::hex << (int)data[i];
            }
            if (data.size() > 6) std::cout << "...";
            std::cout << "]" << std::dec;
        }
        std::cout << std::endl;

        if (!output) {
            std::cerr << "[MidiPort] Cannot send: output is NULL\n";
            return;
        }

        if (data.empty()) {
            std::cerr << "Warning: Attempted to send empty MIDI message\n";
            return;
        }

        if (data[0] == 0xF0) {
            // SysEx message - validate it ends with 0xF7
            if (data.back() != 0xF7) {
                std::cerr << "Warning: Invalid SysEx message (missing 0xF7)\n";
                return;
            }

            // createSysExMessage expects data WITHOUT F0/F7 wrappers
            if (data.size() > 2) {
                output->sendMessageNow(
                    juce::MidiMessage::createSysExMessage(
                        data.data() + 1,      // Skip F0
                        (int)data.size() - 2  // Exclude F0 and F7
                    )
                );
                std::cout << "[MidiPort] SysEx sent (" << data.size() << " bytes)\n";
            }
        } else if (data.size() >= 1 && data.size() <= 3) {
            // Valid short MIDI message (1-3 bytes)
            output->sendMessageNow(
                juce::MidiMessage(data.data(), (int)data.size())
            );
        } else {
            std::cerr << "Warning: Invalid MIDI message length: " << data.size() << " bytes\n";
        }
    }

    std::vector<std::vector<uint8_t>> getMessages() {
        std::lock_guard<std::mutex> lock(queueMutex);
        std::vector<std::vector<uint8_t>> result;
        while (!messageQueue.empty()) {
            result.push_back(messageQueue.front());
            messageQueue.pop();
        }
        return result;
    }

    // MidiInputCallback interface
    void handleIncomingMidiMessage(juce::MidiInput* source,
                                   const juce::MidiMessage& message) override {
        std::vector<uint8_t> data;
        auto rawData = message.getRawData();
        auto size = message.getRawDataSize();

        std::vector<uint8_t> completedMessage;  // For routing callback

        {
            std::lock_guard<std::mutex> lock(queueMutex);

            // Check if this is a SysEx fragment
            bool startsWithF0 = (size > 0 && rawData[0] == 0xF0);
            bool endsWithF7 = (size > 0 && rawData[size - 1] == 0xF7);
            bool isSysExRelated = message.isSysEx() || startsWithF0 ||
                                  (sysexBuffering && size > 0);

            if (isSysExRelated) {
                // Handle SysEx message or fragment
                if (startsWithF0) {
                    // Start of new SysEx - initialize buffer
                    sysexBuffer.clear();
                    sysexBuffer.insert(sysexBuffer.end(), rawData, rawData + size);
                    sysexBuffering = true;

                    // Check if it's a complete SysEx in one message
                    if (endsWithF7) {
                        messageQueue.push(sysexBuffer);
                        completedMessage = sysexBuffer;
                        sysexBuffer.clear();
                        sysexBuffering = false;
                    }
                } else if (sysexBuffering) {
                    // Continuation or end of SysEx
                    sysexBuffer.insert(sysexBuffer.end(), rawData, rawData + size);

                    if (endsWithF7) {
                        // Complete SysEx received
                        messageQueue.push(sysexBuffer);
                        completedMessage = sysexBuffer;
                        sysexBuffer.clear();
                        sysexBuffering = false;
                    }
                    // Otherwise keep buffering
                } else if (message.isSysEx()) {
                    // JUCE already assembled complete SysEx
                    auto sysexData = message.getSysExData();
                    auto sysexSize = message.getSysExDataSize();
                    data.push_back(0xF0);
                    data.insert(data.end(), sysexData, sysexData + sysexSize);
                    data.push_back(0xF7);
                    messageQueue.push(data);
                    completedMessage = data;
                }
            } else {
                // Regular MIDI message (non-SysEx)
                data.insert(data.end(), rawData, rawData + size);
                messageQueue.push(data);
                completedMessage = data;
            }
        }

        // Call routing callback if set (outside queue lock to avoid deadlock)
        if (!completedMessage.empty()) {
            MidiMessageCallback callback;
            {
                std::lock_guard<std::mutex> lock(callbackMutex);
                callback = messageCallback;
            }
            if (callback) {
                callback(portId, completedMessage);
            }
        }
    }

private:
    std::string portId;
    std::string portName;
    bool isInputPort;
    std::unique_ptr<juce::MidiInput> input;
    std::unique_ptr<juce::MidiOutput> output;
    std::queue<std::vector<uint8_t>> messageQueue;
    std::mutex queueMutex;

    // SysEx buffering for fragmented messages
    std::vector<uint8_t> sysexBuffer;
    bool sysexBuffering = false;

    // Callback for routing
    MidiMessageCallback messageCallback;
    std::mutex callbackMutex;
};

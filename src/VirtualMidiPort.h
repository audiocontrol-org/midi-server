/**
 * VirtualMidiPort - Creates virtual MIDI ports for testing
 *
 * Virtual ports appear as real MIDI devices to the system.
 * - Virtual inputs: receive messages sent TO them from other apps
 * - Virtual outputs: capture messages sent FROM them to other apps
 *
 * Key difference from MidiPort:
 * - MidiPort opens existing hardware/software ports
 * - VirtualMidiPort CREATES new virtual ports visible to all apps
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
using VirtualMidiMessageCallback = std::function<void(const std::string& portId,
                                                      const std::vector<uint8_t>& data)>;

class VirtualMidiPort : public juce::MidiInputCallback
{
public:
    VirtualMidiPort(const std::string& id, const std::string& name, bool isInput)
        : portId(id), portName(name), isInputPort(isInput) {}

    // Legacy constructor for backward compatibility
    VirtualMidiPort(const std::string& name, bool isInput)
        : portId("virtual:" + name), portName(name), isInputPort(isInput) {}

    // Set callback for incoming messages (for routing)
    void setMessageCallback(VirtualMidiMessageCallback callback) {
        std::lock_guard<std::mutex> lock(callbackMutex);
        messageCallback = std::move(callback);
    }

    const std::string& getPortId() const { return portId; }

    ~VirtualMidiPort() override { close(); }

    bool open() {
        if (isInputPort) {
            // Create a virtual input port
            // Other apps can send TO this port, and we receive the messages
            virtualInput = juce::MidiInput::createNewDevice(portName, this);
            if (virtualInput) {
                virtualInput->start();
                std::cout << "Created virtual input: " << portName << std::endl;
                return true;
            }
        } else {
            // Create a virtual output port
            // We send TO this port, and other apps receive the messages
            virtualOutput = juce::MidiOutput::createNewDevice(portName);
            if (virtualOutput) {
                std::cout << "Created virtual output: " << portName << std::endl;
                return true;
            }
        }
        return false;
    }

    void close() {
        if (virtualInput) {
            virtualInput->stop();
            virtualInput.reset();
        }
        virtualOutput.reset();
    }

    // Send a message through the virtual output port
    // Other apps listening to this port will receive the message
    void sendMessage(const std::vector<uint8_t>& data) {
        std::cout << "[VirtualMidiPort] sendMessage() portId=" << portId
                  << " virtualOutput=" << (virtualOutput ? "valid" : "NULL")
                  << " bytes=" << data.size() << std::endl;
        if (!virtualOutput) {
            std::cerr << "Cannot send: virtual output not open\n";
            return;
        }

        if (data.empty()) {
            std::cerr << "Warning: Attempted to send empty MIDI message\n";
            return;
        }

        if (data[0] == 0xF0) {
            // SysEx message
            if (data.back() != 0xF7) {
                std::cerr << "Warning: Invalid SysEx message (missing 0xF7)\n";
                return;
            }
            if (data.size() > 2) {
                virtualOutput->sendMessageNow(
                    juce::MidiMessage::createSysExMessage(
                        data.data() + 1,
                        (int)data.size() - 2
                    )
                );
            }
        } else if (data.size() >= 1 && data.size() <= 3) {
            virtualOutput->sendMessageNow(
                juce::MidiMessage(data.data(), (int)data.size())
            );
        } else {
            std::cerr << "Warning: Invalid MIDI message length: " << data.size() << " bytes\n";
        }
    }

    // Inject a message into the virtual input port.
    // Queues for HTTP polling AND fires the routing callback, exactly as if
    // the message arrived from CoreMIDI. Used for automated testing.
    void injectMessage(const std::vector<uint8_t>& data) {
        if (!isInputPort) {
            std::cerr << "Cannot inject: not an input port\n";
            return;
        }

        {
            std::lock_guard<std::mutex> lock(queueMutex);
            messageQueue.push(data);
        }

        // Fire routing callback so routes actually forward the message
        VirtualMidiMessageCallback callback;
        {
            std::lock_guard<std::mutex> lock(callbackMutex);
            callback = messageCallback;
        }
        if (callback) {
            callback(portId, data);
        }
    }

    // Get messages received by this virtual input port
    std::vector<std::vector<uint8_t>> getMessages() {
        std::lock_guard<std::mutex> lock(queueMutex);
        std::vector<std::vector<uint8_t>> result;
        while (!messageQueue.empty()) {
            result.push_back(messageQueue.front());
            messageQueue.pop();
        }
        return result;
    }

    const std::string& getName() const { return portName; }
    bool isInput() const { return isInputPort; }

    // MidiInputCallback interface - receives messages sent TO this virtual input
    void handleIncomingMidiMessage(juce::MidiInput* source,
                                   const juce::MidiMessage& message) override {
        std::vector<uint8_t> data;
        auto rawData = message.getRawData();
        auto size = message.getRawDataSize();

        std::vector<uint8_t> completedMessage;  // For routing callback

        {
            std::lock_guard<std::mutex> lock(queueMutex);

            // Handle SysEx
            bool startsWithF0 = (size > 0 && rawData[0] == 0xF0);
            bool endsWithF7 = (size > 0 && rawData[size - 1] == 0xF7);

            if (message.isSysEx() || startsWithF0) {
                if (startsWithF0) {
                    sysexBuffer.clear();
                    sysexBuffer.insert(sysexBuffer.end(), rawData, rawData + size);
                    sysexBuffering = true;

                    if (endsWithF7) {
                        messageQueue.push(sysexBuffer);
                        completedMessage = sysexBuffer;
                        sysexBuffer.clear();
                        sysexBuffering = false;
                    }
                } else if (sysexBuffering) {
                    sysexBuffer.insert(sysexBuffer.end(), rawData, rawData + size);
                    if (endsWithF7) {
                        messageQueue.push(sysexBuffer);
                        completedMessage = sysexBuffer;
                        sysexBuffer.clear();
                        sysexBuffering = false;
                    }
                } else if (message.isSysEx()) {
                    auto sysexData = message.getSysExData();
                    auto sysexSize = message.getSysExDataSize();
                    data.push_back(0xF0);
                    data.insert(data.end(), sysexData, sysexData + sysexSize);
                    data.push_back(0xF7);
                    messageQueue.push(data);
                    completedMessage = data;
                }
            } else {
                data.insert(data.end(), rawData, rawData + size);
                messageQueue.push(data);
                completedMessage = data;
            }
        }

        // Call routing callback if set (outside queue lock to avoid deadlock)
        if (!completedMessage.empty()) {
            VirtualMidiMessageCallback callback;
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
    std::unique_ptr<juce::MidiInput> virtualInput;
    std::unique_ptr<juce::MidiOutput> virtualOutput;
    std::queue<std::vector<uint8_t>> messageQueue;
    std::mutex queueMutex;

    // SysEx buffering
    std::vector<uint8_t> sysexBuffer;
    bool sysexBuffering = false;

    // Callback for routing
    VirtualMidiMessageCallback messageCallback;
    std::mutex callbackMutex;
};

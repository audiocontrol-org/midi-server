/**
 * JsonBuilder - Simple JSON construction utilities
 *
 * Lightweight JSON builder for HTTP responses.
 * No external dependencies - uses only standard library.
 */

#pragma once

#include <sstream>
#include <string>

class JsonBuilder
{
public:
    JsonBuilder& startObject() {
        if (!firstItem) ss << ",";
        ss << "{";
        firstItem = true;
        return *this;
    }

    JsonBuilder& endObject() {
        ss << "}";
        firstItem = false;
        return *this;
    }

    JsonBuilder& startArray() {
        if (!firstItem) ss << ",";
        ss << "[";
        firstItem = true;
        return *this;
    }

    JsonBuilder& endArray() {
        ss << "]";
        firstItem = false;
        return *this;
    }

    JsonBuilder& key(const std::string& k) {
        if (!firstItem) ss << ",";
        ss << "\"" << k << "\":";
        firstItem = true;
        return *this;
    }

    JsonBuilder& value(const std::string& v) {
        ss << "\"" << v << "\"";
        firstItem = false;
        return *this;
    }

    JsonBuilder& value(bool b) {
        ss << (b ? "true" : "false");
        firstItem = false;
        return *this;
    }

    JsonBuilder& value(int i) {
        ss << i;
        firstItem = false;
        return *this;
    }

    JsonBuilder& arrayValue(const std::string& v) {
        if (!firstItem) ss << ",";
        ss << "\"" << v << "\"";
        firstItem = false;
        return *this;
    }

    JsonBuilder& arrayValue(int i) {
        if (!firstItem) ss << ",";
        ss << i;
        firstItem = false;
        return *this;
    }

    std::string toString() { return ss.str(); }

private:
    std::stringstream ss;
    bool firstItem = true;
};

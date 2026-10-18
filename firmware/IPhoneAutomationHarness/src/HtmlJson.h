#pragma once
#include <ArduinoJson.h>
namespace iah {
// ArduinoJson 7 clears String/std::string destinations. Serialize separately,
// then append; also keep an embedded JSON value from ending its script element.
template<class Text> Text renderHtmlJson(const char* prefix,const Text& value,const char* suffix){
 JsonDocument document;document.set(value);Text encoded;serializeJson(document,encoded);
 Text html(prefix);
 for(size_t i=0;i<encoded.length();i++){char c=encoded[i];if(c=='<')html+="\\u003c";else html+=c;}
 html+=suffix;return html;
}
}

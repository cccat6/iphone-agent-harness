#pragma once
#ifndef IAH_BUILD_ID
#define IAH_BUILD_ID local
#endif
#define IAH_BUILD_ID_TEXT_IMPL(value) #value
#define IAH_BUILD_ID_TEXT(value) IAH_BUILD_ID_TEXT_IMPL(value)
namespace iah {
namespace firmware {
inline constexpr char Version[] = "0.5.5";
inline constexpr char BuildId[] = IAH_BUILD_ID_TEXT(IAH_BUILD_ID);
template<class Json> void addIdentity(Json& value){
 value["firmwareVersion"] = Version;
 value["buildId"] = BuildId;
}
}
}

#undef IAH_BUILD_ID_TEXT
#undef IAH_BUILD_ID_TEXT_IMPL

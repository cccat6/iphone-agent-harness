#pragma once
#include <cstdint>
namespace iah {
struct StorageMigrationResult {uint8_t removed=0;bool complete=true;};
// These four certificates belonged to the retired local-HTTPS transport.
// Check each key independently so an interrupted boot can safely continue later.
template<class Preferences> StorageMigrationResult removeObsoleteTlsStorage(Preferences& prefs){
 StorageMigrationResult result;
 static constexpr const char* keys[]={"leafKey","caKey","leafCert","caCert"};
 for(const char* key:keys){
  if(!prefs.isKey(key))continue;
  if(!prefs.remove(key)){result.complete=false;continue;}
  if(prefs.isKey(key)){result.complete=false;continue;}
  ++result.removed;
 }
 return result;
}
}

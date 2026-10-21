#include "../../firmware/IPhoneAutomationHarness/src/StorageMigration.h"
#include <cassert>
#include <cstdio>
#include <map>
#include <set>
#include <string>
#include <vector>
struct Preferences{
 std::map<std::string,std::string> values;std::set<std::string> fail,pretend;std::vector<std::string> removals;
 bool isKey(const char* key)const{return values.count(key)!=0;}
 bool remove(const char* key){removals.emplace_back(key);if(fail.count(key))return false;if(!pretend.count(key))values.erase(key);return true;}
};
int main(){
 const std::map<std::string,std::string> unrelated={{"network","wifi"},{"ssid","legacy"},{"password","legacy"},{"owner","owner"},{"apPass","setup"},{"grant0","browser"},{"grant7","browser"},{"bond0","phone"},{"target0","target"},{"bridgeSettings","name"},{"otherCert","custom"}};
 {Preferences p;p.values=unrelated;auto r=iah::removeObsoleteTlsStorage(p);assert(r.complete&&r.removed==0&&p.removals.empty()&&p.values==unrelated);}
 {Preferences p;p.values=unrelated;for(auto key:{"leafKey","caKey","leafCert","caCert"})p.values[key]="obsolete";auto r=iah::removeObsoleteTlsStorage(p);assert(r.complete&&r.removed==4&&p.values==unrelated);assert((p.removals==std::vector<std::string>{"leafKey","caKey","leafCert","caCert"}));auto writes=p.removals.size();r=iah::removeObsoleteTlsStorage(p);assert(r.complete&&r.removed==0&&p.removals.size()==writes&&p.values==unrelated);}
 {Preferences p;p.values=unrelated;p.values["leafCert"]="obsolete";auto r=iah::removeObsoleteTlsStorage(p);assert(r.complete&&r.removed==1&&p.values==unrelated);}
 {Preferences p;p.values=unrelated;for(auto key:{"leafKey","caKey","leafCert","caCert"})p.values[key]="obsolete";p.fail.insert("caKey");auto r=iah::removeObsoleteTlsStorage(p);assert(!r.complete&&r.removed==3&&p.values.at("caKey")=="obsolete");for(const auto& item:unrelated)assert(p.values.at(item.first)==item.second);p.fail.clear();r=iah::removeObsoleteTlsStorage(p);assert(r.complete&&r.removed==1&&p.values==unrelated);}
 {Preferences p;p.values=unrelated;p.values["leafKey"]="obsolete";p.pretend.insert("leafKey");auto r=iah::removeObsoleteTlsStorage(p);assert(!r.complete&&r.removed==0&&p.values.at("leafKey")=="obsolete");p.pretend.clear();r=iah::removeObsoleteTlsStorage(p);assert(r.complete&&r.removed==1&&p.values==unrelated);}
 std::puts("Obsolete TLS migration: missing, four-key-only removal, partial failure, readback, retry and idempotence passed");
}

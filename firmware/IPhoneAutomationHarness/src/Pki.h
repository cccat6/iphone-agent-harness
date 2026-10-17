#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <mbedtls/pk.h>
#include <mbedtls/x509_crt.h>
#include <mbedtls/x509.h>
#include <mbedtls/sha256.h>
#include <mbedtls/base64.h>
#include <esp_random.h>
#include <time.h>
#include <vector>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include "SetupState.h"
namespace iah {
inline int secureRandom(void*,unsigned char* out,size_t size){esp_fill_random(out,size);if(xTaskGetSchedulerState()==taskSCHEDULER_RUNNING)vTaskDelay(1);return 0;}
inline String randomHex(size_t bytes){String out;out.reserve(bytes*2);for(size_t i=0;i<bytes;i++){uint8_t b;esp_fill_random(&b,1);char hex[3];snprintf(hex,sizeof(hex),"%02x",b);out+=hex;}return out;}
inline String sha256Hex(const String& text){uint8_t out[32];mbedtls_sha256((const uint8_t*)text.c_str(),text.length(),out,0);String value;for(uint8_t b:out){char h[3];snprintf(h,3,"%02x",b);value+=h;}return value;}
class Pki {
 public:String caPem,keyPem,certPem,caFingerprint;uint64_t expiresAt=0;bool trustProfileChanged=false;
 bool load(Preferences& p,bool requireCommitted=true){
  caPem=p.getString("caCert","");keyPem=p.getString("leafKey","");certPem=p.getString("leafCert","");expiresAt=p.getULong64("certUntil",0);
  if((requireCommitted&&!p.getBool("pkiValid",false))||!fingerprint()||keyPem.isEmpty()||certPem.isEmpty()){keyPem="";certPem="";expiresAt=0;return false;}
  mbedtls_x509_crt ca,leaf;mbedtls_x509_crt_init(&ca);mbedtls_x509_crt_init(&leaf);mbedtls_pk_context key;mbedtls_pk_init(&key);
  bool ok=mbedtls_x509_crt_parse(&ca,(const unsigned char*)caPem.c_str(),caPem.length()+1)==0&&mbedtls_x509_crt_parse(&leaf,(const unsigned char*)certPem.c_str(),certPem.length()+1)==0&&mbedtls_pk_parse_key(&key,(const unsigned char*)keyPem.c_str(),keyPem.length()+1,nullptr,0,secureRandom,nullptr)==0;
  if(ok)ok=mbedtls_pk_check_pair(&leaf.pk,&key,secureRandom,nullptr)==0;
  if(ok){uint32_t flags=0;int result=mbedtls_x509_crt_verify(&leaf,&ca,nullptr,nullptr,&flags,nullptr,nullptr);ok=(result==0||result==MBEDTLS_ERR_X509_CERT_VERIFY_FAILED)&&!(flags&~(MBEDTLS_X509_BADCERT_EXPIRED|MBEDTLS_X509_BADCERT_FUTURE));char until[20];snprintf(until,sizeof(until),"%04d%02d%02d%02d%02d%02d",leaf.valid_to.year,leaf.valid_to.mon,leaf.valid_to.day,leaf.valid_to.hour,leaf.valid_to.min,leaf.valid_to.sec);ok=ok&&date((time_t)expiresAt)==until;}
  mbedtls_pk_free(&key);mbedtls_x509_crt_free(&leaf);mbedtls_x509_crt_free(&ca);if(!ok){keyPem="";certPem="";expiresAt=0;}return ok;
 }
 bool fingerprint(){mbedtls_x509_crt cert;mbedtls_x509_crt_init(&cert);bool ok=mbedtls_x509_crt_parse(&cert,(const unsigned char*)caPem.c_str(),caPem.length()+1)==0;if(ok){uint8_t out[32];mbedtls_sha256(cert.raw.p,cert.raw.len,out,0);caFingerprint="";for(auto b:out){char h[3];snprintf(h,3,"%02x",b);caFingerprint+=h;}}mbedtls_x509_crt_free(&cert);return ok;}
 static String uuid(const String& seed){auto h=sha256Hex(seed);h.setCharAt(12,'4');h.setCharAt(16,'8');return h.substring(0,8)+"-"+h.substring(8,12)+"-"+h.substring(12,16)+"-"+h.substring(16,20)+"-"+h.substring(20,32);}
 static String date(time_t value){struct tm t;gmtime_r(&value,&t);char buffer[20];strftime(buffer,sizeof(buffer),"%Y%m%d%H%M%S",&t);return buffer;}
 static bool key(mbedtls_pk_context& context,String& pem){mbedtls_pk_init(&context);if(mbedtls_pk_setup(&context,mbedtls_pk_info_from_type(MBEDTLS_PK_RSA))!=0)return false;if(mbedtls_rsa_gen_key(mbedtls_pk_rsa(context),secureRandom,nullptr,2048,65537)!=0)return false;unsigned char output[2200];if(mbedtls_pk_write_key_pem(&context,output,sizeof(output))!=0)return false;pem=(const char*)output;return true;}
 static bool certificate(mbedtls_pk_context& subject,mbedtls_pk_context& issuer,const String& subjectName,const String& issuerName,time_t now,time_t until,bool ca,const String& hostname,String& pem){
  mbedtls_x509write_cert crt;mbedtls_x509write_crt_init(&crt);uint8_t serialBytes[16];esp_fill_random(serialBytes,sizeof(serialBytes));serialBytes[0]&=0x7f;serialBytes[0]|=1;
  int result=0;
  mbedtls_x509write_crt_set_version(&crt,MBEDTLS_X509_CRT_VERSION_3);mbedtls_x509write_crt_set_md_alg(&crt,MBEDTLS_MD_SHA256);mbedtls_x509write_crt_set_subject_key(&crt,&subject);mbedtls_x509write_crt_set_issuer_key(&crt,&issuer);
  result|=mbedtls_x509write_crt_set_serial_raw(&crt,serialBytes,sizeof(serialBytes));result|=mbedtls_x509write_crt_set_subject_name(&crt,subjectName.c_str());result|=mbedtls_x509write_crt_set_issuer_name(&crt,issuerName.c_str());result|=mbedtls_x509write_crt_set_validity(&crt,date(now-86400).c_str(),date(until).c_str());result|=mbedtls_x509write_crt_set_basic_constraints(&crt,ca?1:0,ca?0:-1);result|=mbedtls_x509write_crt_set_key_usage(&crt,ca?(MBEDTLS_X509_KU_KEY_CERT_SIGN|MBEDTLS_X509_KU_CRL_SIGN):(MBEDTLS_X509_KU_DIGITAL_SIGNATURE|MBEDTLS_X509_KU_KEY_ENCIPHERMENT));
  if(!ca){
   // SubjectAltName DER: DNS unique hostname + protected AP IPv4 address.
   String name=hostname+".local";std::vector<uint8_t> san{0x30,(uint8_t)(name.length()+8),0x82,(uint8_t)name.length()};san.insert(san.end(),name.c_str(),name.c_str()+name.length());san.insert(san.end(),{0x87,0x04,192,168,4,1});
   const char sanOid[]={0x55,0x1d,0x11};result|=mbedtls_x509write_crt_set_extension(&crt,sanOid,3,0,san.data(),san.size());
   const unsigned char eku[]={0x30,0x0a,0x06,0x08,0x2b,0x06,0x01,0x05,0x05,0x07,0x03,0x01};const char ekuOid[]={0x55,0x1d,0x25};result|=mbedtls_x509write_crt_set_extension(&crt,ekuOid,3,0,eku,sizeof(eku));
  }
  result|=mbedtls_x509write_crt_set_subject_key_identifier(&crt);result|=mbedtls_x509write_crt_set_authority_key_identifier(&crt);
  unsigned char output[2400];if(result==0)result=mbedtls_x509write_crt_pem(&crt,output,sizeof(output),secureRandom,nullptr);if(result==0)pem=(const char*)output;
  mbedtls_x509write_crt_free(&crt);return result==0;
 }
 static String certificateDate(const mbedtls_x509_time& value){char text[20];snprintf(text,sizeof(text),"%04d%02d%02d%02d%02d%02d",value.year,value.mon,value.day,value.hour,value.min,value.sec);return text;}
 bool validAt(const String& pem,time_t now)const{
  mbedtls_x509_crt cert;mbedtls_x509_crt_init(&cert);bool parsed=mbedtls_x509_crt_parse(&cert,(const unsigned char*)pem.c_str(),pem.length()+1)==0;
  bool valid=false;if(parsed){String from=certificateDate(cert.valid_from),until=certificateDate(cert.valid_to),current=date(now);valid=certificateTimeValid(from.c_str(),until.c_str(),current.c_str());}mbedtls_x509_crt_free(&cert);return valid;
 }
 bool provision(Preferences& p,const String& hostname,time_t now){
  if(now<1704067200||now>4102444800)return false;
  trustProfileChanged=false;bool loaded=load(p);String previousFingerprint=caFingerprint;
  if(loaded&&expiresAt>(uint64_t)now+7*86400&&validAt(caPem,now)&&validAt(certPem,now))return true;
  mbedtls_pk_context caKey,leafKey;mbedtls_pk_init(&caKey);mbedtls_pk_init(&leafKey);
  String caPrivate=p.getString("caKey",""),leafPrivate=p.getString("leafKey","");bool ok=false;
  if(caPrivate.length())ok=mbedtls_pk_parse_key(&caKey,(const unsigned char*)caPrivate.c_str(),caPrivate.length()+1,nullptr,0,secureRandom,nullptr)==0;
  else{ok=key(caKey,caPrivate);if(ok)ok=certificate(caKey,caKey,"CN=iPhone Agent Harness CA","CN=iPhone Agent Harness CA",now,now+(time_t)10*365*86400,true,hostname,caPem);}
  if(ok&&(!fingerprint()||!validAt(caPem,now)))ok=certificate(caKey,caKey,"CN=iPhone Agent Harness CA","CN=iPhone Agent Harness CA",now,now+(time_t)10*365*86400,true,hostname,caPem);
  if(ok){if(leafPrivate.isEmpty())ok=key(leafKey,leafPrivate);else{ok=mbedtls_pk_parse_key(&leafKey,(const unsigned char*)leafPrivate.c_str(),leafPrivate.length()+1,nullptr,0,secureRandom,nullptr)==0;if(!ok){mbedtls_pk_free(&leafKey);ok=key(leafKey,leafPrivate);}}}
  if(ok)ok=certificate(leafKey,caKey,"CN="+hostname+".local","CN=iPhone Agent Harness CA",now,now+(time_t)365*86400,false,hostname,certPem);
  if(ok&&p.putBool("pkiValid",false)!=1)ok=false;
  if(ok){keyPem=leafPrivate;expiresAt=now+(time_t)365*86400;p.putString("caKey",caPrivate);p.putString("caCert",caPem);p.putString("leafKey",keyPem);p.putString("leafCert",certPem);p.putULong64("certUntil",expiresAt);ok=p.getString("caKey","")==caPrivate&&p.getString("caCert","")==caPem&&p.getString("leafKey","")==keyPem&&p.getString("leafCert","")==certPem&&p.getULong64("certUntil",0)==expiresAt;if(ok)ok=load(p,false);if(ok)ok=p.putBool("pkiValid",true)==1&&p.getBool("pkiValid",false);if(!ok){p.putBool("pkiValid",false);keyPem="";certPem="";expiresAt=0;}}
  mbedtls_pk_free(&leafKey);mbedtls_pk_free(&caKey);if(ok)trustProfileChanged=previousFingerprint.length()&&previousFingerprint!=caFingerprint;else{keyPem="";certPem="";expiresAt=0;trustProfileChanged=false;}return ok;
 }
 String mobileconfig(const String& boardId){mbedtls_x509_crt ca;mbedtls_x509_crt_init(&ca);if(mbedtls_x509_crt_parse(&ca,(const unsigned char*)caPem.c_str(),caPem.length()+1)!=0){mbedtls_x509_crt_free(&ca);return "";}size_t size=0;mbedtls_base64_encode(nullptr,0,&size,ca.raw.p,ca.raw.len);std::vector<unsigned char> output(size+1);bool ok=mbedtls_base64_encode(output.data(),output.size(),&size,ca.raw.p,ca.raw.len)==0;output[size]=0;mbedtls_x509_crt_free(&ca);if(!ok)return "";String id="cc.igent."+boardId,profileUuid=uuid(boardId+"-profile"),caUuid=uuid(boardId+"-ca");
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\"><plist version=\"1.0\"><dict><key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer><key>PayloadIdentifier</key><string>"+id+"</string><key>PayloadUUID</key><string>"+profileUuid+"</string><key>PayloadDisplayName</key><string>iPhone Agent Harness local CA</string><key>PayloadContent</key><array><dict><key>PayloadType</key><string>com.apple.security.root</string><key>PayloadVersion</key><integer>1</integer><key>PayloadIdentifier</key><string>"+id+".ca</string><key>PayloadUUID</key><string>"+caUuid+"</string><key>PayloadDisplayName</key><string>Device local HTTPS certificate</string><key>PayloadContent</key><data>"+String((char*)output.data())+"</data></dict></array></dict></plist>";
 }
};
}

String getFechaActual() {
  if (WiFi.status() != WL_CONNECTED) {
    return "offline";
  }

  timeClient.update();
  
  time_t epochTime = timeClient.getEpochTime();

  if (epochTime < 1000000000) {
    return "offline";
  }

  struct tm timeinfo;
  gmtime_r(&epochTime, &timeinfo);

  char buffer[11];
  sprintf(buffer, "%04d-%02d-%02d", timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday);
  
  return String(buffer);
}

bool enviarRegistroNube(int id, String nombre, String tipo) {
  if (WiFi.status() != WL_CONNECTED) return false;
  static StaticJsonDocument<256> jsonDoc;
  static HTTPClient http;
  jsonDoc.clear();
  jsonDoc["id"] = id; jsonDoc["nombre"] = nombre; jsonDoc["tipo"] = tipo;
  String payload;
  serializeJson(jsonDoc, payload);
  if(http.begin(SCRIPT_URL)){
    http.addHeader("Content-Type", "application/json");
    int httpCode = http.POST(payload);
    http.end();
    return (httpCode == HTTP_CODE_OK || httpCode == 302);
  }
  return false;
}

String leerEstadoEmpleado(int id, String &fecha) {
  String path = "/" + String(id) + ".status";
  if (SPIFFS.exists(path)) {
    File file = SPIFFS.open(path, "r");
    if (file) {
      String line = file.readStringUntil('\n');
      file.close(); line.trim();
      int commaIndex = line.indexOf(',');
      if (commaIndex != -1) {
        fecha = line.substring(commaIndex + 1);
        return line.substring(0, commaIndex);
      }
    }
  }
  fecha = "";
  return "FUERA";
}

void guardarEstadoEmpleado(int id, String estado, String fecha) {
  File file = SPIFFS.open("/" + String(id) + ".status", "w");
  if (file) { file.print(estado + "," + fecha); file.close(); }
}

String leerAdminPIN() {
  if (SPIFFS.exists("/admin.pin")) {
    File file = SPIFFS.open("/admin.pin", "r");
    if(file){ String pin = file.readString(); file.close(); return pin; }
  }
  return DEFAULT_ADMIN_PIN;
}

void guardarAdminPIN(String pin) {
  File file = SPIFFS.open("/admin.pin", "w");
  if(file){ file.print(pin); file.close(); }
}

void guardarNombre(uint16_t id, String n) {
  File f=SPIFFS.open("/"+String(id)+".txt","w");
  if(f){ f.print(n); f.close(); }
}

String leerNombre(uint16_t id) {
  String p="/"+String(id)+".txt";
  if(SPIFFS.exists(p)){
    File f=SPIFFS.open(p,"r");
    if(f){ String n=f.readString(); f.close(); return n; }
  }
  return "N/A";
}

bool eliminarHuella(uint16_t id) {
  finger.deleteModel(id);
  String p="/"+String(id)+".txt"; if(SPIFFS.exists(p)){SPIFFS.remove(p);}
  String s="/"+String(id)+".status"; if(SPIFFS.exists(s)){SPIFFS.remove(s);}
  return true;
}

int leerHuella() {
  uint8_t p=finger.getImage(); if(p!=FINGERPRINT_OK)return -1;
  p=finger.image2Tz(); if(p!=FINGERPRINT_OK)return -1;
  p=finger.fingerSearch(); if(p!=FINGERPRINT_OK)return -1;
  return finger.fingerID;
}

String obtenerCaracterT9(char t, int c) {
  String g[]={"","","ABC","DEF","GHI","JKL","MNO","PQRS","TUV","WXYZ"};
  if(t<'2'||t>'9')return"";
  String gr=g[t-'0'];
  return String(gr[c%gr.length()]);
}

int registrarHuella(uint16_t id) {
  int p=-1;
  display.clearDisplay();display.setCursor(5,10);display.println("Coloque el dedo...");display.display();
  while(p!=FINGERPRINT_OK){p=finger.getImage(); yield();}
  p=finger.image2Tz(1); if(p!=FINGERPRINT_OK)return -1;
  p=finger.fingerSearch(); if(p==FINGERPRINT_OK)return -2;
  display.clearDisplay();display.setCursor(5,10);display.println("Retire el dedo");display.display();
  delay(1500); // Este delay es difícil de quitar sin reestructurar toda la función
  p=0; while(p!=FINGERPRINT_NOFINGER){p=finger.getImage(); yield();}
  p=-1; display.clearDisplay();display.setCursor(5,10);display.println("Coloque de nuevo");display.display();
  while(p!=FINGERPRINT_OK){p=finger.getImage(); yield();}
  p=finger.image2Tz(2); if(p!=FINGERPRINT_OK)return -1;
  p=finger.createModel(); if(p!=FINGERPRINT_OK)return -1;
  p=finger.storeModel(id); if(p!=FINGERPRINT_OK)return -1;
  return 0;
}
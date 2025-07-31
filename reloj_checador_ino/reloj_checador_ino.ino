// 1. LIBRERÍAS EXTERNAS
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <WiFiManager.h>
#include <NTPClient.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Keypad.h>
#include <Adafruit_Fingerprint.h>
#include <HardwareSerial.h>
#include "SPIFFS.h"
#include <HTTPClient.h>
#include <ArduinoJson.h>

// 2. TU ARCHIVO DE CONFIGURACIÓN
#include "config.h"

// 3. DECLARACIÓN DE OBJETOS Y VARIABLES GLOBALES
// --- OBJETOS DE HARDWARE ---
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", -14400, 60000);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
HardwareSerial mySerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&mySerial);
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// --- ESTRUCTURA DE ESTADOS ---
// Se añade el estado MOSTRANDO_MENSAJE para la lógica no bloqueante
enum EstadoPrincipal { PANTALLA_PRINCIPAL, LOGIN_ADMIN, MARCANDO, MENU_ADMIN, MOSTRANDO_MENSAJE };
EstadoPrincipal estadoActual = PANTALLA_PRINCIPAL;
enum EstadoAdmin { ADMIN_MENU, REG_ID, REG_NOMBRE, CONFIRMAR_REGISTRO, ELIMINAR_ID, VER_REGISTROS, ADMIN_LEER_HUELLA, CAMBIAR_PIN_NUEVO, CAMBIAR_PIN_CONFIRMA, WIFI_PIN_CONFIRM, CONFIG_WIFI_PORTAL };
EstadoAdmin estadoAdmin = ADMIN_MENU;

// --- VARIABLES GLOBALES ---
String tempInput = "";
String nombreTemp = "";
String nuevoPin = "";
int totalRegistros = 0;
int paginaActual = 0;
char lastT9Key = '\0';
unsigned long lastT9Time = 0;
int cicloT9 = 0;
bool letraPendiente = false;

// --- VARIABLES PARA LÓGICA NO BLOQUEANTE ---
unsigned long tiempoDeMensaje = 0;
unsigned long duracionDelMensaje = 0;
EstadoPrincipal estadoSiguientePrincipal;
EstadoAdmin estadoSiguienteAdmin;
String mensajeParaMostrar1 = "";
String mensajeParaMostrar2 = "";
String mensajeParaMostrar3 = "";


// 4. INCLUSIÓN DE ARCHIVOS CON FUNCIONES AUXILIARES
#include "funciones_logica.h"
#include "pantalla.h"

//****************************************************************//
//            FUNCIÓN PARA MANEJAR MENSAJES SIN DELAY             //
//****************************************************************//
void iniciarPantallaMensaje(String msg1, String msg2, String msg3, unsigned long duracion, EstadoPrincipal sigPrincipal, EstadoAdmin sigAdmin) {
    mensajeParaMostrar1 = msg1;
    mensajeParaMostrar2 = msg2;
    mensajeParaMostrar3 = msg3;
    duracionDelMensaje = duracion;
    estadoSiguientePrincipal = sigPrincipal;
    estadoSiguienteAdmin = sigAdmin;
    estadoActual = MOSTRANDO_MENSAJE;
    tiempoDeMensaje = millis();
}


//****************************************************************//
//                         5. SETUP Y LOOP                        //
//****************************************************************//
void setup() {
  Serial.begin(115200);

  // --- REFUERZO DE SOFTWARE: Configuración explícita de pines ---
  for (byte i = 0; i < COLS; i++) {
    pinMode(colPins[i], INPUT_PULLUP);
  }
  for (byte i = 0; i < ROWS; i++) {
    pinMode(rowPins[i], OUTPUT);
  }

  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println(F("Fallo OLED")); while(1); }
  display.clearDisplay(); display.setTextSize(1); display.println("Iniciando..."); display.display();
  if(!SPIFFS.begin(true)){ display.println("Fallo SPIFFS");display.display(); while(1); }

  WiFiManager wifiManager;
  wifiManager.setConnectTimeout(20);
  wifiManager.setConfigPortalTimeout(180);
  if (!wifiManager.autoConnect("RelojChecador-Config")) {
      Serial.println("Fallo al conectar. Iniciando en modo offline.");
  }

  if(WiFi.status() == WL_CONNECTED) {
    display.println("WiFi conectado!"); display.display();
    timeClient.begin();
  } else {
    display.println("Error WiFi. Modo offline."); display.display();
  }

  mySerial.begin(57600, SERIAL_8N1, 16, 17);
  finger.begin(57600);
  if (!finger.verifyPassword()) { display.println("Sensor no encontrado");display.display(); while (1); }

  delay(1000); // Pequeña pausa inicial
}

void loop() {
  char key = keypad.getKey();
  switch (estadoActual) {
    case PANTALLA_PRINCIPAL:
      if (WiFi.status() == WL_CONNECTED) { timeClient.update(); }
      mostrarPantallaPrincipal();
      if(key == '1') { estadoActual = MARCANDO; }
      if(key == '2') { tempInput = ""; estadoActual = LOGIN_ADMIN; mostrarLoginAdmin("Ingrese PIN Admin:"); }
      // Se elimina el delay(100) para no bloquear el loop
      break;

    case MARCANDO: {
      display.clearDisplay(); display.setCursor(5, 20);
      display.println("Coloque su huella..."); display.setCursor(5, 40); display.println("Cualquier tecla cancela"); display.display();
      String mensajeFinal = ""; String nombreEmpleado = "";
      while (true) {
        int idEncontrado = leerHuella();
        if (idEncontrado != -1) {
          nombreEmpleado = leerNombre(idEncontrado);
          String tipoMarcaje = "";
          String fechaHoy = getFechaActual();
          if (fechaHoy == "offline") {
              mensajeFinal = "Error: Sin WiFi"; break;
          }

          String ultimoEstado = "", ultimaFecha = "";
          ultimoEstado = leerEstadoEmpleado(idEncontrado, ultimaFecha);

          if (ultimoEstado == "FUERA" && ultimaFecha == fechaHoy) {
            mensajeFinal = "Jornada COMPLETA";
          } else if (ultimoEstado == "DENTRO") {
            tipoMarcaje = "Salida";
            if (enviarRegistroNube(idEncontrado, nombreEmpleado, tipoMarcaje)) {
                guardarEstadoEmpleado(idEncontrado, "FUERA", fechaHoy);
                mensajeFinal = nombreEmpleado + "\nSALIDA REGISTRADA";
            } else {
                mensajeFinal = "Error de Red\nIntente de nuevo";
            }
          } else {
            tipoMarcaje = "Entrada";
            if (enviarRegistroNube(idEncontrado, nombreEmpleado, tipoMarcaje)) {
                guardarEstadoEmpleado(idEncontrado, "DENTRO", fechaHoy);
                mensajeFinal = nombreEmpleado + "\nENTRADA REGISTRADA";
            } else {
                mensajeFinal = "Error de Red\nIntente de nuevo";
            }
          }
          break;
        }
        char cancelKey = keypad.getKey();
        if (cancelKey) { mensajeFinal = ""; break; }
        delay(50); // Pequeña pausa para no saturar el sensor
      }

      if (mensajeFinal != "") {
        iniciarPantallaMensaje(mensajeFinal, "", "", 3000, PANTALLA_PRINCIPAL, ADMIN_MENU);
      } else {
        estadoActual = PANTALLA_PRINCIPAL;
      }
      break;
    }

    case LOGIN_ADMIN:
      if(key) {
        if(key >= '0' && key <= '9' && tempInput.length() < 10) {
          tempInput += key;
          mostrarLoginAdmin("Ingrese PIN Admin:");
        }
        if(key == 'C') {
          tempInput = "";
          estadoActual = PANTALLA_PRINCIPAL;
        }
        if(key == '#') {
          if(tempInput == leerAdminPIN()) {
            estadoActual = MENU_ADMIN;
            estadoAdmin = ADMIN_MENU;
            mostrarMenuAdmin();
          } else {
            iniciarPantallaMensaje("PIN Incorrecto", "", "", 1500, PANTALLA_PRINCIPAL, ADMIN_MENU);
          }
          tempInput = "";
        }
      }
      break;

    case MENU_ADMIN: {
      if(!key) return;
      if (letraPendiente && millis() - lastT9Time > 1500) { letraPendiente=false; lastT9Key='\0'; cicloT9=0; }
      switch (estadoAdmin) {
        case ADMIN_MENU:
          if(key=='1'){estadoAdmin=REG_ID;tempInput="";ingresarID();}
          else if(key=='2'){estadoAdmin=ADMIN_LEER_HUELLA;}
          else if(key=='3'){estadoAdmin=ELIMINAR_ID;tempInput="";ingresarIDEliminar();}
          else if(key=='4'){estadoAdmin=VER_REGISTROS;paginaActual=0;mostrarPaginaDeRegistros();}
          else if(key=='5'){estadoAdmin=CAMBIAR_PIN_NUEVO;tempInput="";mostrarPantallaNuevoPIN();}
          else if(key=='6'){estadoAdmin=WIFI_PIN_CONFIRM; tempInput=""; mostrarLoginAdmin("Confirmar PIN Admin:");}
          else if(key=='*'){estadoActual=PANTALLA_PRINCIPAL;}
          break;
        case ADMIN_LEER_HUELLA: {
            display.clearDisplay(); display.setCursor(5,15); display.println("Coloque un dedo..."); display.setCursor(5,35);
            display.println("Cualquier tecla cancela"); display.display();
            while(true) {
              int idEncontrado = leerHuella();
              if(idEncontrado != -1){
                  String nombre = leerNombre(idEncontrado);
                  iniciarPantallaMensaje("ID: " + String(idEncontrado), nombre, "", 3000, MENU_ADMIN, ADMIN_MENU);
                  return;
              }
              char cancelKey = keypad.getKey();
              if(cancelKey) { estadoAdmin = ADMIN_MENU; mostrarMenuAdmin(); break; }
              delay(50);
            }
            break;
          }
        case WIFI_PIN_CONFIRM:
            if(key >= '0' && key <= '9' && tempInput.length() < 10) { tempInput += key; mostrarLoginAdmin("Confirmar PIN Admin:"); }
            else if(key == 'C') { estadoAdmin = ADMIN_MENU; mostrarMenuAdmin(); }
            else if(key == '#') {
                if(tempInput == leerAdminPIN()) { estadoAdmin = CONFIG_WIFI_PORTAL; }
                else { iniciarPantallaMensaje("PIN Incorrecto", "", "", 1500, MENU_ADMIN, ADMIN_MENU); }
            }
            break;
        case CONFIG_WIFI_PORTAL: {
            display.clearDisplay(); display.setCursor(0,10); display.println("Presione 'A' para"); display.setCursor(0,25);
            display.println("iniciar portal WiFi"); display.setCursor(0,45); display.println("C=Cancelar"); display.display();
            char choice = 0;
            while(choice == 0) { choice = keypad.getKey(); }
            if(choice == 'A') {
              WiFiManager wm;
              wm.setConfigPortalTimeout(180);
              display.clearDisplay(); display.setCursor(0,10); display.println("Activando portal..."); display.setCursor(0,25); display.println("Conectese a la red:"); display.setCursor(0,40); display.println("RelojChecador-Config"); display.display();
              if (wm.startConfigPortal("RelojChecador-Config")) {
                  display.clearDisplay();
                  display.setCursor(10,25); display.println("Guardado!"); display.setCursor(10,40); display.println("Reiniciando..."); display.display();
                  delay(2000); // Delay necesario antes de reiniciar
                  ESP.restart();
              } else {
                  iniciarPantallaMensaje("Config. cancelada", "", "", 2000, MENU_ADMIN, ADMIN_MENU);
              }
            } else {
              estadoAdmin = ADMIN_MENU;
              mostrarMenuAdmin();
            }
            break;
        }
        case CAMBIAR_PIN_NUEVO:
            if(key>='0' && key<='9' && tempInput.length()<10) {tempInput+=key; mostrarPantallaNuevoPIN();}
            else if(key=='A' && tempInput.length() > 0) { nuevoPin = tempInput; tempInput = ""; estadoAdmin = CAMBIAR_PIN_CONFIRMA; mostrarPantallaConfirmaPIN(); }
            else if(key=='C') { estadoAdmin = ADMIN_MENU; mostrarMenuAdmin(); }
            break;
        case CAMBIAR_PIN_CONFIRMA:
            if(key>='0' && key<='9' && tempInput.length()<10) {tempInput+=key; mostrarPantallaConfirmaPIN();}
            else if(key=='A' && tempInput == nuevoPin) {
                guardarAdminPIN(nuevoPin);
                iniciarPantallaMensaje("PIN cambiado OK!", "", "", 2000, MENU_ADMIN, ADMIN_MENU);
            }
            else if (key=='A' && tempInput != nuevoPin) {
                iniciarPantallaMensaje("PIN no coincide", "", "", 2000, MENU_ADMIN, ADMIN_MENU);
            }
            else if(key=='C') { estadoAdmin = ADMIN_MENU; mostrarMenuAdmin(); }
            break;
        case REG_ID:
          if(key>='0'&&key<='9'&&tempInput.length()<5){tempInput+=key;ingresarID();}
          else if(key=='A'&&tempInput.length()>0){estadoAdmin=REG_NOMBRE;nombreTemp="";ingresarNombre();}
          else if(key=='C'){estadoAdmin=ADMIN_MENU;mostrarMenuAdmin();}
          break;
        case ELIMINAR_ID:
          if(key>='0'&&key<='9'&&tempInput.length()<5){tempInput+=key;ingresarIDEliminar();}
          else if(key=='A'&&tempInput.length()>0){
              display.clearDisplay();display.setCursor(5,10);display.print("Eliminando ID:");display.println(tempInput);display.display();
              eliminarHuella(tempInput.toInt());
              iniciarPantallaMensaje("ID: " + tempInput, "Eliminado.", "", 2000, MENU_ADMIN, ADMIN_MENU);
          }
          else if(key=='C'){estadoAdmin=ADMIN_MENU;mostrarMenuAdmin();}
          break;
        case VER_REGISTROS: {
          int totalPaginas=(totalRegistros==0)?1:ceil((float)totalRegistros/registrosPorPagina);
          if(key=='A'){if(paginaActual<totalPaginas-1){paginaActual++;mostrarPaginaDeRegistros();}}
          else if(key=='B'){if(paginaActual>0){paginaActual--;mostrarPaginaDeRegistros();}}
          else if(key=='C'){estadoAdmin=ADMIN_MENU;mostrarMenuAdmin();}
          break;
        }
        case REG_NOMBRE:
          if(key>='2'&&key<='9'){ if(letraPendiente&&key!=lastT9Key){letraPendiente=false;lastT9Key='\0';cicloT9=0;} if(key==lastT9Key&&millis()-lastT9Time<1000){cicloT9++;nombreTemp.remove(nombreTemp.length()-1);}else{cicloT9=0;} lastT9Key=key;lastT9Time=millis();letraPendiente=true;
          nombreTemp+=obtenerCaracterT9(key,cicloT9);ingresarNombre(); }
          else if(key=='A'&&nombreTemp.length()>0){letraPendiente=false;estadoAdmin=CONFIRMAR_REGISTRO;confirmarRegistro();}
          else if(key=='B'&&nombreTemp.length()>0){letraPendiente=false;nombreTemp.remove(nombreTemp.length()-1);ingresarNombre();}
          else if(key=='C'){estadoAdmin=ADMIN_MENU;mostrarMenuAdmin();}
          break;
        case CONFIRMAR_REGISTRO: {
          if(key=='A'){ int idActual=tempInput.toInt(); int res=registrarHuella(idActual);
            if(res==0){
                guardarNombre(idActual,nombreTemp);
                iniciarPantallaMensaje("Registrado OK!", "", "", 2500, MENU_ADMIN, ADMIN_MENU);
            } else if(res==-2){
                iniciarPantallaMensaje("ERROR: Huella ya", "registrada", "", 2500, MENU_ADMIN, ADMIN_MENU);
            } else{
                iniciarPantallaMensaje("Fallo el registro", "", "", 2500, MENU_ADMIN, ADMIN_MENU);
            }
          }
          else if(key=='B'){estadoAdmin=REG_NOMBRE;ingresarNombre();}
          else if(key=='C'){estadoAdmin=ADMIN_MENU;mostrarMenuAdmin();}
          break;
        }
      }
      break;
    }

    case MOSTRANDO_MENSAJE:
        mostrarPantallaMensaje(mensajeParaMostrar1, mensajeParaMostrar2, mensajeParaMostrar3);
        if (millis() - tiempoDeMensaje >= duracionDelMensaje) {
            estadoActual = estadoSiguientePrincipal;
            estadoAdmin = estadoSiguienteAdmin;
            if(estadoActual == MENU_ADMIN) {
                mostrarMenuAdmin(); // Redibujar menú si volvemos a él
            }
        }
        break;
  }
}
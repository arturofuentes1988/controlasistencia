// --- CONFIGURACIÓN PRINCIPAL ---
const char* SCRIPT_URL = "AQUÍ_VA_TU_URL_SECRETA_DE_APPS_SCRIPT";
const String DEFAULT_ADMIN_PIN = "1234";

// --- Configuración de Pantalla ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

// --- Configuración de Teclado ---
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};
byte rowPins[ROWS] = {26, 25, 33, 32};
byte colPins[COLS] = {13, 12, 14, 27};

// --- Configuración de Registros ---
const int registrosPorPagina = 5;
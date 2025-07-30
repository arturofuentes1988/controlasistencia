void mostrarPantallaPrincipal() {
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(WHITE);
  display.setCursor(0, 0);
  if (WiFi.status() == WL_CONNECTED) {
    display.print("WiFi OK");
  } else {
    display.print("WiFi OFFLINE");
  }
  display.setTextSize(2); display.setCursor(20, 15);
  display.println(timeClient.getFormattedTime().substring(0, 5));
  display.setTextSize(1);
  display.setCursor(5, 40); display.println("1. Marcar");
  display.setCursor(5, 52); display.println("2. Configuracion");
  display.display();
}

void mostrarMenuAdmin() {
  display.clearDisplay();display.setTextSize(1);display.setTextColor(WHITE);
  display.setCursor(10,0);display.println("---CONFIGURACION---");
  display.setCursor(10,8);display.println("1. Registrar");
  display.setCursor(10,18);display.println("2. Identificar");
  display.setCursor(10,28);display.println("3. Eliminar");
  display.setCursor(10,38);display.println("4. Ver Registros");
  display.setCursor(10,48);display.println("5. Cambiar PIN");
  display.setCursor(10,58);display.println("6. Configurar WiFi");
  display.display();
}

void mostrarPaginaDeRegistros() {
  display.clearDisplay(); display.setTextSize(1); display.setTextColor(WHITE);
  
  // *** CORRECCIÓN: Se añade "static" para evitar desbordamiento de memoria (stack) ***
  static String fileList[128]; 
  
  int fileCount = 0;
  File root = SPIFFS.open("/");
  if(root){
    File file = root.openNextFile();
    while(file && fileCount < 128){
      String fileName = file.name();
      if (fileName.endsWith(".txt")) {
        fileList[fileCount] = fileName;
        fileCount++;
      }
      file = root.openNextFile();
    }
    root.close();
  }
  totalRegistros = fileCount;
  int totalPaginas = (totalRegistros == 0) ? 1 : ceil((float)totalRegistros / registrosPorPagina);
  if (paginaActual >= totalPaginas) { paginaActual = totalPaginas - 1; }
  if (paginaActual < 0) { paginaActual = 0; }
  display.setCursor(0, 0);
  display.print("Registros (P."); display.print(paginaActual + 1); display.print("/"); display.print(totalPaginas); display.println(")");
  int inicio = paginaActual * registrosPorPagina;
  for (int i = inicio; i < (inicio + registrosPorPagina) && i < totalRegistros; i++) {
    String fileName = fileList[i];
    String idStr = fileName.substring(fileName.lastIndexOf('/') + 1, fileName.lastIndexOf('.'));
    String nombre = leerNombre(idStr.toInt());
    display.setCursor(0, 12 + ((i - inicio) * 10));
    display.print(idStr); display.print(": "); display.print(nombre);
  }
  if (totalRegistros == 0) { display.setCursor(10, 25); display.println("No hay registros."); }
  display.setCursor(0, 55); display.print("A>Sig B<Ant C<Salir");
  display.display();
}

void mostrarLoginAdmin(String texto) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(WHITE);
  display.setCursor(10,5);
  display.println(texto);
  display.setCursor(10,25);

  // *** MEJORA: Muestra asteriscos en lugar del PIN ***
  String pinEnmascarado = "";
  for (unsigned int i = 0; i < tempInput.length(); i++) {
    pinEnmascarado += '*';
  }
  display.println(pinEnmascarado);

  display.setCursor(0,50);
  display.println("#=OK  C=Cancelar");
  display.display();
}

void mostrarPantallaNuevoPIN() {
  display.clearDisplay(); display.setTextSize(1); display.setCursor(10,5); display.println("Ingrese PIN nuevo:");
  display.setCursor(10,25); display.println(tempInput);
  display.setCursor(0,50); display.println("A=OK  C=Cancelar");
  display.display();
}

void mostrarPantallaConfirmaPIN() {
  display.clearDisplay(); display.setTextSize(1); display.setCursor(10,5); display.println("Confirme nuevo PIN:");
  display.setCursor(10,25); display.println(tempInput);
  display.setCursor(0,50); display.println("A=OK  C=Cancelar");
  display.display();
}

void ingresarID() {
  display.clearDisplay(); display.setCursor(0,0); display.setTextSize(1);
  display.print("ID a registrar:");
  display.println(tempInput);
  display.setCursor(0,50); display.println("A=OK C=Cancelar");
  display.display();
}

void ingresarIDEliminar() {
  display.clearDisplay(); display.setCursor(0,0); display.setTextSize(1);
  display.print("ID a eliminar:");
  display.println(tempInput);
  display.setCursor(0,50); display.println("A=Borrar C=Cancelar");
  display.display();
}

void ingresarNombre() {
  display.clearDisplay(); display.setCursor(0,0); display.setTextSize(1);
  display.println("Nombre:"); display.setCursor(0,20); display.println(nombreTemp);
  display.setCursor(0,50); display.println("A=OK B=Borrar C=Cancelar");
  display.display();
}

void confirmarRegistro() {
  display.clearDisplay(); display.setCursor(0,0); display.setTextSize(1);
  display.println("Confirmar registro:");
  display.setCursor(0,15); display.print("ID:"); display.println(tempInput);
  display.print("Nombre:"); display.println(nombreTemp);
  display.setCursor(0,50); display.println("A=OK B=Volver C=Cancelar");
  display.display();
}
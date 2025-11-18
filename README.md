# PracticaMultimedia
#  SoundTrip – Viaje Sonoro Interactivo
 


##  Descripción del Proyecto

**SoundTrip** nace con la idea de explorar el concepto de "turismo sensorial". Nuestro objetivo es desarrollar una aplicación web multimedia que permita al usuario viajar virtualmente por el mundo a través de **paisajes sonoros (soundscapes)**.

Al navegar por un mapa interactivo y seleccionar diferentes países, la aplicación no solo mostrará información visual, sino que sumergirá al usuario en el ambiente auditivo característico de ese lugar (el bullicio de Tokio, la selva de Brasil, las olas del Mediterráneo...).

---

##  Objetivos de la Práctica

Con este proyecto, buscamos poner en práctica y demostrar dominio en:

1.  **Integración Multimedia:** Sincronización de audio, imagen y datos geográficos en una misma interfaz.
2.  **Manipulación del DOM:** Carga dinámica de contenidos sin recargar la página.
3.  **Uso de APIs:** Implementación de librerías de mapas (Leaflet) y uso de la API nativa de Audio del navegador.
4.  **Arquitectura de Datos:** Separación entre lógica (JavaScript) y contenido (JSON).

---

##  ¿Cómo lo vamos a hacer? 

Para garantizar que el proyecto sea escalable y técnicamente sólido, hemos diseñado la siguiente estructura:

### 1. Mapa Interactivo 
Utilizaremos la librería ligera **Leaflet.js** sobre capas de OpenStreetMap.
* **Implementación:** No usaremos el mapa estático por defecto; programaremos eventos de `flyTo` (vuelo de cámara) para que el desplazamiento entre países sea fluido y visual.
* **Marcadores:** Los puntos de interés se generarán dinámicamente mediante bucles en JS.

### 2. Gestión de Datos 
Para evitar "quemar" (hardcode) los datos en el código HTML/JS, crearemos un archivo externo `countries.json`.
* **Estructura:** Este archivo contendrá un array de objetos con: nombre del país, coordenadas (lat/lng), ruta del archivo de audio, ruta de la imagen y descripción.
* **Carga:** Usaremos `fetch()` y `async/await` para leer estos datos al iniciar la aplicación. Esto nos permitirá añadir nuevos países en el futuro solo editando el archivo de texto.

### 3. Motor de Audio 
En lugar de depender de librerías externas pesadas para el sonido, vamos a programar nuestro propio controlador de audio.
* **Reto técnico:** Implementaremos un algoritmo de **Crossfading** (transición suave de volumen).
* **Objetivo:** Que al cambiar de un país a otro, el sonido anterior baje su volumen suavemente (fade-out) mientras entra el nuevo (fade-in), evitando cortes bruscos y mejorando la experiencia de usuario.

### 4. Interfaz y Diseño
* **Estilo:** Diseño "Dark Mode" para resaltar el mapa y las imágenes, usando Variables CSS para facilitar cambios de tema.
* **Responsive:** Uso de CSS Grid y Flexbox para que la web funcione tanto en escritorio como en móviles (panel lateral adaptable).

---

## Funcionalidades Previstas

* [ ] Mapa mundial navegable con zoom y arrastre.
* [ ] Marcadores interactivos en países clave.
* [ ] Panel lateral informativo (se abre al hacer clic).
* [ ] Reproductor de audio con controles (Play/Pause/Stop).
* [ ] Efectos visuales de transición.
* [ ] (Opcional) Botón de "Viaje Aleatorio" (Random Trip).




# Viper Web - Frontend

**Viper** es una plataforma SaaS (Software as a Service) de gestión deportiva con enfoque **B2B2C**, pensada para clubes de tenis y pádel. Centraliza la experiencia del jugador y la operatividad del club en una única interfaz web responsiva.

* **B2B (Clubes):** el sistema se comercializa a múltiples clubes, que gestionan su operación desde un mismo ecosistema.
* **B2C (Jugadores):** cualquier persona puede crear una cuenta gratuita en Viper, pertenezca o no a un club. El jugador es una entidad global de la plataforma.

### 🎾 Funcionalidades para Jugadores:
* **Autogestión de Reservas:** Visualización de disponibilidad en tiempo real y reserva de canchas de tenis y pádel.
* **Circuito Competitivo:** Exploración de torneos vigentes, inscripción en línea y visualización de llaves de competencia (brackets).
* **Tienda Digital:** Acceso al catálogo de los clubes para la compra o reserva de artículos deportivos y accesorios.
* **Perfil Deportivo:** Consulta de historial de partidos, saldos, comunicados oficiales y evolución en el ranking.

### ⚙️ Funcionalidades para Clubes (Administración):
* **Control Operativo:** Gestión avanzada de la grilla de turnos con bloqueos para evitar solapamientos.
* **Logística de Torneos:** Generador automático de llaves de eliminación y motor de planificación de horarios (Scheduler).
* **Caja y POS:** Módulo de punto de venta físico, control lógico de inventario y conciliación de caja diaria integrada con Mercado Pago.
* **Dashboard Gerencial:** Generación de reportes financieros consolidados y publicación de cartelera de novedades.

## 🛠️ Stack Tecnológico
* **Librería Principal:** React.js
* **Empaquetador:** Vite
* **Estilos:** Tailwind CSS (v4)
* **Gestor de Paquetes:** pnpm

## 🚀 Guía de Instalación para el Equipo

Para clonar y levantar la interfaz web en sus computadoras locales, sigan estos pasos exactos:

**1. Clonar el repositorio**
```bash
git clone https://github.com/MateoNavarroMN/viper-web.git
cd viper-web
```

**2. Instalar las dependencias**
Asegúrense de tener `pnpm` instalado. Luego ejecuten:
```bash
pnpm install
```

**3. Configurar Variables de Entorno**
* Creen un archivo llamado `.env` en la raíz de esta carpeta.
* En este archivo configuraremos más adelante la URL de conexión con nuestra API local o en producción.

**4. Levantar el entorno de desarrollo**
```bash
pnpm run dev
```
Vite levantará el proyecto de forma instantánea. Podrán visualizar la aplicación abriendo `http://localhost:5173`.
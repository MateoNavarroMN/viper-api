# Viper API - Backend

API RESTful para el sistema de gestión integral de **La Rochelle Tennis Club**. Este servicio gestiona la lógica de negocio, la concurrencia de reservas, la organización de torneos y la comunicación con la base de datos.

## 🛠️ Stack Tecnológico
* **Entorno:** Node.js
* **Framework:** ExpressJS
* **Base de Datos:** PostgreSQL (vía Supabase)
* **Autenticación:** JSON Web Tokens (JWT)
* **Gestor de Paquetes:** pnpm

## 🚀 Guía de Instalación para el Equipo

Para clonar y levantar este entorno en sus computadoras locales, sigan estos pasos exactos:

**1. Clonar el repositorio**
```bash
git clone https://github.com/MateoNavarroMN/viper-api.git
cd viper-api
```

**2. Instalar las dependencias**
Asegúrense de tener `pnpm` instalado. Luego ejecuten:
```bash
pnpm install
```

**3. Configurar Variables de Entorno**
Por seguridad, las credenciales no se suben a GitHub. 
* Creen un archivo llamado `.env` en la raíz de esta carpeta.
* Pegar las credenciales actuales de Supabase en ese archivo.

**4. Levantar el servidor de desarrollo**
```bash
pnpm run dev
```
El servidor quedará escuchando cambios en vivo gracias a Nodemon. Por defecto, correrá en `http://localhost:3000`.
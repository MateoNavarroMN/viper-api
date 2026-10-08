# Viper API - Backend

**Viper** es una plataforma SaaS B2B2C (Software as a Service) para la gestión integral de múltiples clubes deportivos. Los clubes (B2B) contratan la plataforma y ofrecen a sus socios y jugadores (B2C) una experiencia digital unificada.

Esta API RESTful es el motor transaccional del sistema SaaS multicliente: gestiona la lógica de negocio, la concurrencia de reservas, la organización de torneos y la comunicación con la base de datos, manteniendo los datos de cada club aislados dentro de una misma plataforma.

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
# Esquema de Implementacion: Admin + Cliente

Fecha de version: 2026-03-07  
Estado: Base acordada para implementar

## 1) Objetivo

Construir una app de administracion (dashboard) que gestiona una web publica para clientes, dejando listo el terreno para incorporar rol `CLIENTE` sin refactor grande.

## 2) Arquitectura objetivo

1. Separar frontends:
   - App Admin (dashboard interno)
   - App Cliente/Publica (sitio o portal cliente)
2. Mantener backend, auth y base de datos compartidos.
3. Despliegue en Vercel con un dominio y dos subdominios:
   - `www.tudominio.com` (o `tudominio.com`) para cliente/publico
   - `admin.tudominio.com` para administracion
4. Evitar dos dominios totalmente distintos salvo necesidad comercial/legal.

## 3) Autenticacion y seguridad

1. Password con `bcrypt` (`saltRounds = 12` recomendado).
2. Validacion de payloads con `zod` en frontend y backend.
3. Sesion por cookie segura (`httpOnly`, `secure`, `sameSite`), sin JWT manual en `localStorage`.
4. Verificacion de email con codigo OTP de 6 digitos:
   - Expiracion corta (10 minutos recomendado)
   - Maximo de intentos por codigo (5 recomendado)
   - Codigo de un solo uso
   - Reenvio con cooldown y rate limit
5. Rate limit en login/verificacion/reenvio.

## 4) Registro de usuarios (decision tomada)

1. `signup` solo para bootstrap inicial:
   - Si no existe ningun usuario, el primero se crea como `ADMIN`.
   - Cuando ya existe al menos un usuario, cerrar `signup` publico.
2. Altas futuras de usuarios solo por `ADMIN` (crear o invitar).

## 5) Roles iniciales

1. `ADMIN`:
   - Acceso completo al dashboard y funciones de carga/gestion.
2. `CLIENTE`:
   - Acceso restringido segun matriz de permisos.

## 6) Matriz de permisos acordada para CLIENTE

1. Seccion **Calendario Anual**:
   - Puede acceder al **Calendario Anual**.
   - Puede acceder a **Personal Cargado** con permisos de **solo lectura**.
   - No accede a paneles administrativos (ej.: e-mails).
2. Seccion **Mes Particular**:
   - Puede navegar calendario mensual y evento del dia.
   - No puede usar la funcion **Cargar PDF**.

## 7) Regla tecnica obligatoria de autorizacion

Los permisos se aplican en 3 capas:

1. UI: ocultar botones/opciones no permitidas.
2. Rutas: bloquear navegacion a paginas restringidas.
3. Backend/API: validar rol y permiso en servidor (respuesta `403` si no corresponde).

La capa de backend es la fuente de verdad.

## 8) Modelo de datos minimo recomendado

1. `users`
   - `id`, `email`, `password_hash`, `status`, `created_at`, `last_login_at`
2. `user_roles`
   - `user_id`, `role`, `client_id` (preparado para permisos por cliente)
3. `clients` (si aplica multi-cliente)
4. `email_verification_codes`
   - `user_id`, `code_hash`, `expires_at`, `attempts`, `consumed_at`, `sent_count`, `last_sent_at`
5. `audit_logs`
   - `user_id`, `action`, `resource`, `created_at`, `ip`

## 9) Plan por fases

1. Fase 1:
   - Login admin + bootstrap seguro del primer admin
   - RBAC base (`ADMIN` y `CLIENTE`)
2. Fase 2:
   - Dashboard admin completo
   - Publicacion segura de contenido para web publica
3. Fase 3:
   - Habilitar app/portal `CLIENTE` con permisos definidos
4. Fase 4:
   - Hardening: auditoria ampliada, 2FA para admin, limites avanzados

## 10) Criterios de exito

1. No existe acceso de `CLIENTE` a carga de PDF ni funciones admin.
2. `CLIENTE` puede visualizar calendario anual, mensual y evento del dia.
3. `CLIENTE` puede visualizar `Personal Cargado` en solo lectura.
4. Ningun endpoint sensible acepta acciones sin validacion de rol en backend.
5. El primer admin se crea una sola vez por bootstrap, luego no hay signup publico.

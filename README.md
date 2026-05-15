# Essentials

Essentials is a self-hosted, Dockerized web platform designed as a secure, extensible foundation for managing browser-based container sessions. It features a clean architecture separating the frontend (React/Vite served via Nginx) and backend (Node.js/Express) with MongoDB for persistence.

## Features

- **Mandatory Admin Onboarding** — Ensures the application is secured from the very first launch by requiring an initial administrator account.
- **Secure Local Authentication** — JWTs and `bcrypt` for stateless, secure user authentication and password hashing. Passwords must meet a strong policy (8+ characters, 1 uppercase, 1 number, 1 special character).
- **Live Password Strength Indicator** — Real-time ✓/✗ requirement checklist shown while typing a password, preventing weak passwords from being submitted.
- **OpenID Connect (SSO) Integration** — Fully configurable OIDC support managed through the Admin panel. Supports auto-provisioning, group-based role mapping, auto-redirect, and an emergency local-login bypass (`/login?local=true`).
- **User Management** — Administrators can view, create, and delete users with a confirmation modal to prevent accidents.
- **Tabbed Administration Panel** — Clean sliding-indicator tab UI with tabs for User Management, Authentication settings, Docker Stats, and System Logs.
- **Containerized Architecture** — Entire stack orchestrated via Docker Compose with an Nginx reverse proxy and a local bind mount for the database.
- **Premium UI/UX** — Dark mode glassmorphism design with smooth animations, custom checkboxes, and an animated sliding tab indicator.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd Essentials
   ```

2. **Start the application:**
   ```bash
   docker compose up --build -d
   ```

3. **Access the application:**
   ```
   http://localhost:3000
   ```

4. **Complete Onboarding:**  
   Create your initial admin account. Passwords must include at least 8 characters, one uppercase letter, one number, and one special character.

## OpenID Connect Setup

SSO is configured entirely from the **Administration → Authentication** tab. You will need:

| Field | Description |
|---|---|
| Issuer URL | Your provider's OIDC discovery URL (e.g. `https://accounts.google.com`) |
| Client ID | Application client ID from your provider |
| Client Secret | Application client secret from your provider |
| Scopes | Space-separated list (default: `openid profile email`) |
| Group Claim Name | The claim field containing user groups (e.g. `groups`) |
| Admin Group Value | The group name that grants admin privileges (e.g. `admins`) |

### Provider Redirect URIs

Register these in your OIDC provider's application settings:

| Type | URL |
|---|---|
| Redirect / Callback URI | `https://your-domain/api/sso/callback` |
| Post-Logout Redirect URI | `https://your-domain/logout` |

> **Note:** Both URLs are displayed with copy buttons directly inside the Authentication tab.

### Emergency Bypass

If SSO is misconfigured and you get locked out, navigate to:
```
http://your-domain/login?local=true
```
This forces the local login form to appear regardless of SSO settings.

## Password Policy

All local accounts (onboarding and admin-created) must satisfy:
- ✓ At least 8 characters
- ✓ At least 1 uppercase letter
- ✓ At least 1 number
- ✓ At least 1 special character (`!@#$%^&*` etc.)

## Development

The project is a monorepo with separate `frontend` and `backend` directories.

- **Frontend** — Vite + React + TypeScript. Built statically and served by Nginx in production. The Nginx config reverse-proxies `/api` requests to the Node.js backend.
- **Backend** — Node.js + Express + TypeScript. Handles authentication, user management, SSO brokering, and database interactions via Mongoose.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, React Router, Lucide-React |
| Backend | Node.js, Express 5, TypeScript, Mongoose, jsonwebtoken, bcrypt, openid-client |
| Database | MongoDB |
| Infrastructure | Docker, Docker Compose, Nginx |

# Essentials

Essentials is a self-hosted, Dockerized web application platform designed to serve as a secure and extensible foundation. It features a robust architecture separating the frontend (React/Vite served via Nginx) and backend (Node.js/Express) with a MongoDB database for persistence.

## Features

- **Mandatory Admin Onboarding**: Ensures the application is secure from the very first launch by requiring the creation of an initial administrator account.
- **Secure Authentication**: Built with JWTs and `bcrypt` for secure, stateless user authentication and password hashing.
- **User Management**: A dedicated administration panel allows administrators to easily view, add, and safely remove users from the system.
- **Containerized Architecture**: The entire stack is orchestrated seamlessly via Docker Compose, utilizing a local bind mount for the database and an Nginx reverse proxy for the frontend.
- **Premium UI/UX**: Designed with modern web aesthetics in mind, featuring dark mode, glassmorphism, smooth animations, and a responsive layout.

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
   Using Docker Compose, you can build and launch the entire stack:
   ```bash
   docker compose up --build -d
   ```

3. **Access the application:**
   Once the containers are up and running, open your browser and navigate to:
   ```
   http://localhost:3000
   ```

4. **Complete Onboarding:**
   You will be greeted by the onboarding screen. Create your initial admin account to access the dashboard.

## Development

The project is structured as a monorepo with separate `frontend` and `backend` directories.

- **Frontend**: A Vite-powered React application with TypeScript. The UI is built using vanilla CSS with a custom design system. During production, it is built statically and served by Nginx.
- **Backend**: A Node.js API built with Express and TypeScript. It handles user authentication, data validation, and database interactions using Mongoose.

## Tech Stack

- **Frontend**: React, Vite, React Router, Lucide-React
- **Backend**: Node.js, Express, TypeScript, Mongoose, jsonwebtoken, bcrypt
- **Database**: MongoDB
- **Infrastructure**: Docker, Nginx

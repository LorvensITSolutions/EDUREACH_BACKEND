# Deployment Guide - X Company Attendance Management System

This guide provides step-by-step instructions for deploying the attendance management system in different environments.

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 16+ and npm 8+
- MongoDB 4.4+
- Git

### 1. Clone and Setup
```bash
git clone <repository-url>
cd attendance-system
npm run setup
```

### 2. Start MongoDB
```bash
# macOS (using Homebrew)
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Windows
# Start MongoDB service from Services
```

### 3. Create Default Admin User
```bash
curl -X POST http://localhost:5000/api/auth/create-admin
```

### 4. Start Development Servers
```bash
# Start both frontend and backend
npm run dev

# Or start separately
npm run dev:backend  # Backend on http://localhost:5000
npm run dev:frontend # Frontend on http://localhost:3000
```

### 5. Access the System
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- Default Admin: admin@xcompany.com / admin123

## 🏭 Production Deployment

### Environment Setup

#### 1. Backend Environment Variables
Create `.env` file in `backend/` directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# Database Configuration
MONGODB_URI=mongodb://username:password@host:port/database
# Or MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/database

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-here
JWT_EXPIRES_IN=24h

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS Configuration
FRONTEND_URL=https://your-domain.com

# Logging Configuration
LOG_LEVEL=error
```

#### 2. Frontend Environment Variables
Create `.env` file in `frontend/` directory:

```env
REACT_APP_API_URL=https://your-api-domain.com/api
```

### Deployment Options

#### Option 1: Traditional VPS/Server

##### Backend Deployment
```bash
# Install dependencies
cd backend
npm install --production

# Build the application
npm run build

# Start with PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

##### Frontend Deployment
```bash
# Install dependencies
cd frontend
npm install

# Build for production
npm run build

# Serve with nginx
sudo apt-get install nginx
sudo cp nginx.conf /etc/nginx/sites-available/attendance-system
sudo ln -s /etc/nginx/sites-available/attendance-system /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Option 2: Docker Deployment

##### Create Dockerfile for Backend
```dockerfile
# backend/Dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5000

CMD ["npm", "start"]
```

##### Create Dockerfile for Frontend
```dockerfile
# frontend/Dockerfile
FROM node:16-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
```

##### Docker Compose
```yaml
# docker-compose.yml
version: '3.8'

services:
  mongodb:
    image: mongo:5.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
      MONGO_INITDB_DATABASE: attendance-system
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"

  backend:
    build: ./backend
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://admin:password@mongodb:27017/attendance-system
      - JWT_SECRET=your-secret-key
      - FRONTEND_URL=http://localhost
    ports:
      - "5000:5000"
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  mongodb_data:
```

#### Option 3: Cloud Platform Deployment

##### Heroku
```bash
# Backend
cd backend
heroku create attendance-system-backend
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI=your-mongodb-uri
heroku config:set JWT_SECRET=your-secret-key
git push heroku main

# Frontend
cd frontend
heroku create attendance-system-frontend
heroku config:set REACT_APP_API_URL=https://attendance-system-backend.herokuapp.com/api
git push heroku main
```

##### AWS
- Use AWS ECS for containerized deployment
- Use AWS RDS for MongoDB Atlas
- Use AWS CloudFront for frontend CDN
- Use AWS Route 53 for DNS

##### Google Cloud Platform
- Use Google Cloud Run for serverless deployment
- Use Google Cloud SQL for database
- Use Google Cloud Storage for static files

## 🔒 Security Considerations

### 1. Environment Variables
- Never commit `.env` files to version control
- Use strong, unique secrets for JWT
- Rotate secrets regularly

### 2. Database Security
- Use MongoDB Atlas or secure MongoDB instance
- Enable authentication and authorization
- Use SSL/TLS connections
- Regular backups

### 3. Network Security
- Use HTTPS in production
- Configure CORS properly
- Set up rate limiting
- Use a reverse proxy (nginx)

### 4. Application Security
- Keep dependencies updated
- Use Helmet.js for security headers
- Implement proper input validation
- Log security events

## 📊 Monitoring and Logging

### 1. Application Monitoring
```bash
# PM2 monitoring
pm2 monit
pm2 logs

# Health check endpoint
curl http://localhost:5000/health
```

### 2. Database Monitoring
```bash
# MongoDB monitoring
mongo --eval "db.serverStatus()"
mongo --eval "db.stats()"
```

### 3. Log Management
- Use Winston for structured logging
- Send logs to external service (ELK, CloudWatch, etc.)
- Monitor error rates and response times

## 🔄 CI/CD Pipeline

### GitHub Actions Example
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm run install:all
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to production
        run: |
          # Add your deployment commands here
```

## 🚨 Troubleshooting

### Common Issues

#### 1. MongoDB Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check connection
mongo --eval "db.runCommand('ping')"
```

#### 2. Port Conflicts
```bash
# Check what's using the port
lsof -i :5000
lsof -i :3000

# Kill process if needed
kill -9 <PID>
```

#### 3. Permission Issues
```bash
# Fix file permissions
sudo chown -R $USER:$USER .
chmod +x setup.js
```

#### 4. Build Issues
```bash
# Clear cache and reinstall
npm run clean
npm run install:all
```

## 📞 Support

For deployment issues:
1. Check the logs: `pm2 logs` or `docker logs`
2. Verify environment variables
3. Check network connectivity
4. Review security group/firewall settings

## 🔄 Updates and Maintenance

### Regular Maintenance Tasks
1. Update dependencies monthly
2. Rotate JWT secrets quarterly
3. Review and clean audit logs
4. Monitor disk space and performance
5. Backup database regularly

### Update Process
```bash
# Pull latest changes
git pull origin main

# Update dependencies
npm run install:all

# Restart services
pm2 restart all
# or
docker-compose down && docker-compose up -d
``` 
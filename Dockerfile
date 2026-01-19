# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables
ARG VITE_GEMINI_API_KEY
ARG VITE_ABACATE_PAY_API_KEY
ARG VITE_DEEPSEEK_API_KEY
ARG VITE_BREVO_API_KEY

# Set as environment variables for Vite build
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_ABACATE_PAY_API_KEY=$VITE_ABACATE_PAY_API_KEY
ENV VITE_DEEPSEEK_API_KEY=$VITE_DEEPSEEK_API_KEY
ENV VITE_BREVO_API_KEY=$VITE_BREVO_API_KEY

# Build application with environment variables
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

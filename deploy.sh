#!/bin/bash

# Script para Deploy em Produção (Docker Compose)
# Uso: ./deploy.sh

echo "🚢 Iniciando deploy para produção..."

# Atualizar código (opcional, habilitar se estiver usando git)
# echo "📥 Puxando últimas alterações..."
# git pull origin main

echo "🏗️ Reconstruindo containers..."
docker-compose down
docker-compose up -d --build --remove-orphans

echo "🚀 Deploy finalizado com sucesso!"
echo "📡 Verifique os logs com: ./logs.sh"

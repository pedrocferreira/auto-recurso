#!/bin/bash

# Script para monitorar logs do Auto Recurso (Frontend e Backend)
# Uso: ./logs.sh

echo "--- Iniciando monitoramento de logs (Ctrl+C para sair) ---"
docker-compose logs -f

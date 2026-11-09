#!/bin/bash

# Script para desenvolvimento local (Frontend + Backend)
# Uso: ./dev.sh

echo "🚀 Iniciando ambiente de desenvolvimento..."

# Encontrar o diretório onde o script está localizado
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Função para limpar processos ao sair
cleanup() {
    echo -e "\n🛑 Parando serviços..."
    # Mata todos os processos filhos
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT

# Iniciar Backend
export NODE_OPTIONS='--dns-result-order=ipv4first'
echo "📡 Iniciando Backend (Porta 3001)..."
(cd server && npm run dev) &

# Iniciar Frontend
echo "💻 Iniciando Frontend (Porta 5173)..."
npm run dev -- --port 5173 &

echo "✅ Tudo pronto! O Frontend estará em http://localhost:5173 e o Backend em http://localhost:3001"
wait

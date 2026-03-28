#!/bin/bash

# 🚀 Arabic AI Medical Assistant System - Quick Start Guide

echo "=========================================="
echo "Arabic AI Medical Assistant Setup"
echo "=========================================="
echo ""

# 1. Install dependencies
echo "📦 Installing OpenAI SDK..."
cd /Users/farishelal/Documents/emergency-response-system
pnpm add -F @ers/api openai

# 2. Setup database
echo "🗄️ Running database migrations..."
cd services/api
pnpm run migrate

# 3. Configuration
echo "⚙️ Configuration needed:"
echo ""
echo "Add to .env file in services/api/:"
echo "  OPENAI_API_KEY=sk-... (get it from https://platform.openai.com)"
echo ""

# 4. Start the backend
echo "🚀 Starting backend server..."
pnpm run dev

echo ""
echo "=========================================="
echo "✅ System ready!"
echo "=========================================="
echo ""
echo "📍 API endpoints available at:"
echo "  http://localhost:4100/api/v1/ai/chat"
echo "  http://localhost:4100/api/v1/ai/conversations"
echo "  http://localhost:4100/api/v1/ai/stats"
echo ""
echo "📖 Full documentation in:"
echo "  services/api/AI_ASSISTANT_GUIDE.md"
echo ""

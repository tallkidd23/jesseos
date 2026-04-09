# readmepro - install lamas

# Futurenoding


# 1. Update system packages (optional but good practice)
brew update || echo "Homebrew not needed"

# 2. Install Python 3 if missing (macOS usually has it)
python3 --version || brew install python3

# 3. Install Ollama (downloads ~100MB binary, runs local LLMs)
curl -fsSL https://ollama.com/install.sh | sh

# 4. Start Ollama daemon in background
ollama serve &

# 5. Pull the phi3:mini model (~2GB, used by default)
ollama pull phi3:mini

# 6. Install ollama Python package
pip3 install ollama

# 7. Make script executable (if not already)
chmod +x JesseOS-retro.py

# 8. Run it!
./jesseos-firstrun.py

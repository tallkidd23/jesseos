document.addEventListener('DOMContentLoaded', function() {
    const output = document.getElementById('output');
    const commandInput = document.getElementById('command-input');
    const inputDisplay = document.getElementById('input-display');
    const cursor = document.getElementById('cursor');
    const prompt = document.getElementById('prompt');
    const keyboard = document.getElementById('keyboard');
    
    let commandHistory = [];
    let historyIndex = -1;
    let currentCommand = '';
    let currentPath = ['B:\\'];
    let isProcessing = false;
    let capsLock = false;
    let shiftPressed = false;
    
    const fileSystem = {
        'B:\\': {
            type: 'dir',
            children: {
                'WEATHER': { type: 'dir', children: {} },
                'NEWS': { type: 'dir', children: {} },
                'BOARD': { type: 'dir', children: {} },
                'GAMES': { type: 'dir', children: {} },
                'ABOUT.TXT': { 
                    type: 'file', 
                    content: 'JESSEOS v1.0\nLBSTRCOMP Terminal Emulator\nDeveloped by Jesse\n\nSystem Features:\n- Real-time weather updates\n- Live news headlines\n- Message board archive\n- Retro CRT display effects\n- Physical keyboard simulation\n\nType DIR to see available commands.'
                },
                'STATUS.EXE': { type: 'exe', handler: executeStatus },
                'CLS.EXE': { type: 'exe', handler: executeCls }
            }
        }
    };
    
    function getCurrentDir() {
        const pathKey = currentPath.join('');
        return fileSystem[pathKey] || fileSystem['B:\\'];
    }
    
    function updatePrompt() {
        const pathStr = currentPath.join('');
        prompt.textContent = pathStr + '>';
        updateCursor();
    }
    
    function updateCursor() {
        cursor.textContent = '█';
    }
    
    function setInputDisplay() {
        inputDisplay.textContent = currentCommand;
        updateCursor();
    }
    
    function addToOutput(text, className = '') {
        const lines = text.split('\n');
        lines.forEach((line, index) => {
            if (index > 0 || lines.length > 1) {
                const div = document.createElement('div');
                div.textContent = line;
                if (className) div.classList.add(className);
                output.appendChild(div);
            } else {
                const div = document.createElement('div');
                div.textContent = line;
                if (className) div.classList.add(className);
                output.appendChild(div);
            }
        });
        output.scrollTop = output.scrollHeight;
    }
    
    function executeCommand(cmd) {
        if (isProcessing) return;
        
        const trimmedCmd = cmd.trim();
        if (!trimmedCmd) {
            addToOutput(currentPath.join('') + '>' + currentCommand);
            currentCommand = '';
            setInputDisplay();
            return;
        }
        
        isProcessing = true;
        addToOutput(currentPath.join('') + '>' + currentCommand);
        commandHistory.push(trimmedCmd);
        historyIndex = commandHistory.length;
        currentCommand = '';
        setInputDisplay();
        
        const parts = trimmedCmd.split(/\s+/);
        const command = parts[0].toUpperCase();
        const args = parts.slice(1);
        
        setTimeout(() => {
            processCommand(command, args);
            isProcessing = false;
            commandInput.value = '';
        }, 100);
    }
    
    function processCommand(command, args) {
        const currentDir = getCurrentDir();
        
        if (command === 'DIR') {
            executeDir(currentDir);
        } else if (command === 'CD') {
            executeCd(args);
        } else if (command === 'TYPE') {
            executeType(args);
        } else if (command === 'CLS') {
            executeCls();
        } else if (command === 'STATUS') {
            executeStatus();
        } else if (command === 'HELP') {
            executeHelp();
        } else if (command === 'WEATHER') {
            executeWeatherLegacy(args);
        } else if (command === 'NEWS') {
            executeNewsLegacy(args);
        } else if (command === 'BOARD') {
            executeBoardLegacy(args);
        } else if (command === 'GAMES') {
            executeGamesLegacy(args);
        } else if (command === 'ABOUT') {
            executeAboutLegacy();
        } else if (command === 'EXIT') {
            executeExit();
        } else {
            const exeName = command.endsWith('.EXE') ? command : command + '.EXE';
            if (currentDir.children && currentDir.children[exeName] && currentDir.children[exeName].type === 'exe') {
                currentDir.children[exeName].handler(args);
            } else {
                addToOutput(`'${command}' is not recognized as an internal or external command, executable program, or batch file.`);
            }
        }
        
        updatePrompt();
    }
    
    function executeDir(currentDir) {
        if (!currentDir || !currentDir.children) {
            addToOutput('Invalid directory.');
            return;
        }
        
        addToOutput(`DIRECTORY OF ${currentPath.join('')}`);
        addToOutput('');
        
        const entries = Object.entries(currentDir.children);
        if (entries.length === 0) {
            addToOutput('No files or directories.');
        } else {
            entries.forEach(([name, entry]) => {
                if (entry.type === 'dir') {
                    addToOutput(` ${name.padEnd(12)} <DIR>   Directory`);
                } else if (entry.type === 'file') {
                    addToOutput(` ${name.padEnd(12)}         File`);
                } else if (entry.type === 'exe') {
                    addToOutput(` ${name.padEnd(12)}         Executable`);
                }
            });
        }
    }
    
    function executeCd(args) {
        if (args.length === 0) {
            addToOutput(currentPath.join(''));
            return;
        }
        
        const target = args[0].toUpperCase();
        const currentDir = getCurrentDir();
        
        if (target === '..') {
            if (currentPath.length > 1) {
                currentPath.pop();
                addToOutput(`Changed directory to ${currentPath.join('')}`);
            } else {
                addToOutput('Already at root directory.');
            }
        } else if (target === '\\') {
            currentPath = ['B:\\'];
            addToOutput('Changed directory to B:\\');
        } else {
            if (currentDir.children && currentDir.children[target] && currentDir.children[target].type === 'dir') {
                currentPath.push(target + '\\');
                addToOutput(`Changed directory to ${currentPath.join('')}`);
            } else {
                addToOutput(`Directory not found: ${target}`);
            }
        }
        
        updatePrompt();
    }
    
    function executeType(args) {
        if (args.length === 0) {
            addToOutput('Required parameter missing.');
            return;
        }
        
        const fileName = args[0].toUpperCase();
        const currentDir = getCurrentDir();
        
        if (currentDir.children && currentDir.children[fileName] && currentDir.children[fileName].type === 'file') {
            addToOutput(currentDir.children[fileName].content);
        } else {
            addToOutput(`File not found: ${fileName}`);
        }
    }
    
    function executeStatus() {
        addToOutput('JESSEOS System Status');
        addToOutput('=====================');
        addToOutput('System: Online');
        addToOutput('Memory: 64KB Available');
        addToOutput('Disk B: 1.44MB Total');
        addToOutput('Network: Connected');
        addToOutput('Display: LBSTRCOMP CRT');
    }
    
    function executeCls() {
        output.innerHTML = '';
    }
    
    function executeHelp() {
        addToOutput('JESSEOS Commands:');
        addToOutput('  DIR              - List directory contents');
        addToOutput('  CD <directory>   - Change directory');
        addToOutput('  TYPE <file>      - Display file contents');
        addToOutput('  CLS              - Clear screen');
        addToOutput('  STATUS           - Show system status');
        addToOutput('  HELP             - Show this help');
        addToOutput('  WEATHER          - Weather commands (legacy)');
        addToOutput('  NEWS             - News commands (legacy)');
        addToOutput('  BOARD            - Message board (legacy)');
        addToOutput('  GAMES            - Games directory (legacy)');
    }
    
    function executeWeatherLegacy(args) {
        addToOutput('Weather commands are now in B:\\WEATHER directory.');
        addToOutput('Use: CD WEATHER then DIR to see available programs.');
    }
    
    function executeNewsLegacy(args) {
        addToOutput('News commands are now in B:\\NEWS directory.');
        addToOutput('Use: CD NEWS then DIR to see available programs.');
    }
    
    function executeBoardLegacy(args) {
        addToOutput('Message board is now in B:\\BOARD directory.');
        addToOutput('Use: CD BOARD then DIR to see available programs.');
    }
    
    function executeGamesLegacy(args) {
        addToOutput('Games are now in B:\\GAMES directory.');
        addToOutput('Use: CD GAMES then DIR to see available programs.');
    }
    
    function executeAboutLegacy() {
        addToOutput('JESSEOS v1.0');
        addToOutput('LBSTRCOMP Terminal Emulator');
        addToOutput('Developed by Jesse');
    }
    
    function executeExit() {
        addToOutput('Goodbye!');
        commandInput.disabled = true;
    }
    
    commandInput.addEventListener('input', function() {
        if (isProcessing) {
            this.value = currentCommand;
            return;
        }
        
        currentCommand = this.value;
        setInputDisplay();
    });
    
    commandInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeCommand(this.value);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                currentCommand = commandHistory[historyIndex];
                this.value = currentCommand;
                setInputDisplay();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                currentCommand = commandHistory[historyIndex];
                this.value = currentCommand;
                setInputDisplay();
            } else {
                historyIndex = commandHistory.length;
                currentCommand = '';
                this.value = '';
                setInputDisplay();
            }
        } else if (e.key === 'Tab') {
            e.preventDefault();
            autoComplete();
        }
    });
    
    function autoComplete() {
        const currentDir = getCurrentDir();
        if (!currentDir || !currentDir.children) return;
        
        const partial = currentCommand.toUpperCase();
        const matches = Object.keys(currentDir.children).filter(name => 
            name.startsWith(partial)
        );
        
        if (matches.length === 1) {
            currentCommand = matches[0];
            commandInput.value = matches[0];
            setInputDisplay();
        } else if (matches.length > 1) {
            addToOutput(currentPath.join('') + '>' + currentCommand);
            matches.forEach(match => {
                const entry = currentDir.children[match];
                const type = entry.type === 'dir' ? '<DIR>' : 
                            entry.type === 'exe' ? '.EXE' : '';
                addToOutput(` ${match.padEnd(12)} ${type}`);
            });
            currentCommand = '';
            commandInput.value = '';
            setInputDisplay();
        }
    }
    
    keyboard.addEventListener('click', function(e) {
        if (e.target.classList.contains('key')) {
            const key = e.target.dataset.key;
            simulateKeyPress(key);
            
            e.target.classList.add('active');
            setTimeout(() => {
                e.target.classList.remove('active');
            }, 150);
        }
    });
    
    function simulateKeyPress(key) {
        if (isProcessing) return;
        
        let char = key;
        
        if (key === 'Backspace') {
            if (currentCommand.length > 0) {
                currentCommand = currentCommand.slice(0, -1);
                commandInput.value = currentCommand;
                setInputDisplay();
            }
            return;
        }
        
        if (key === 'Enter') {
            executeCommand(currentCommand);
            return;
        }
        
        if (key === 'Shift') {
            shiftPressed = true;
            return;
        }
        
        if (key === 'CapsLock') {
            capsLock = !capsLock;
            return;
        }
        
        if (key.length === 1) {
            if (shiftPressed || (capsLock && key >= 'a' && key <= 'z')) {
                char = key.toUpperCase();
            } else if (!shiftPressed && capsLock && key >= 'A' && key <= 'Z') {
                char = key.toLowerCase();
            } else if (!shiftPressed && !capsLock) {
                char = key.toLowerCase();
            }
            
            currentCommand += char;
            commandInput.value = currentCommand;
            setInputDisplay();
        }
        
        setTimeout(() => {
            shiftPressed = false;
        }, 100);
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.target === commandInput) return;
        
        const keyElement = Array.from(keyboard.querySelectorAll('.key'))
            .find(k => k.dataset.key.toLowerCase() === e.key.toLowerCase());
        
        if (keyElement) {
            keyElement.classList.add('active');
        }
        
        if (e.key === 'Shift') {
            shiftPressed = true;
            const shiftKeys = Array.from(keyboard.querySelectorAll('.key[data-key="Shift"]'));
            shiftKeys.forEach(k => k.classList.add('active'));
        }
        
        if (e.key === 'CapsLock') {
            capsLock = !capsLock;
            const capsKey = keyboard.querySelector('.key[data-key="CapsLock"]');
            if (capsKey) {
                capsKey.classList.toggle('active', capsLock);
            }
        }
    });
    
    document.addEventListener('keyup', function(e) {
        const keyElement = Array.from(keyboard.querySelectorAll('.key'))
            .find(k => k.dataset.key.toLowerCase() === e.key.toLowerCase());
        
        if (keyElement) {
            keyElement.classList.remove('active');
        }
        
        if (e.key === 'Shift') {
            shiftPressed = false;
            const shiftKeys = Array.from(keyboard.querySelectorAll('.key[data-key="Shift"]'));
            shiftKeys.forEach(k => k.classList.remove('active'));
        }
    });
    
    commandInput.focus();
    document.addEventListener('click', function() {
        commandInput.focus();
    });
    
    addToOutput('JESSEOS v1.0');
    addToOutput('LBSTRCOMP Terminal Emulator');
    addToOutput('Type HELP for available commands.');
    addToOutput('');
    updatePrompt();
});
import { EventEmitter } from 'events';

export interface Command {
  name: string;
  triggers: string[];
  description: string;
  execute: () => void;
}

export interface CommandProcessorConfig {
  enabled: boolean;
  commandPrefix: string;
  caseSensitive: boolean;
  fuzzyMatching: boolean;
  minimumConfidence: number;
}

export class CommandProcessor extends EventEmitter {
  private commands: Command[] = [];
  private config: CommandProcessorConfig = {
    enabled: true,
    commandPrefix: 'computer',
    caseSensitive: false,
    fuzzyMatching: true,
    minimumConfidence: 0.7
  };

  constructor() {
    super();
  }

  /**
   * Register a new command
   */
  public registerCommand(command: Command): void {
    // Check if command already exists
    const existingCommand = this.commands.find(cmd => cmd.name === command.name);
    if (existingCommand) {
      throw new Error(`Command with name "${command.name}" already exists`);
    }

    this.commands.push(command);
    this.emit('commandRegistered', command);
  }

  /**
   * Unregister a command
   */
  public unregisterCommand(commandName: string): void {
    const index = this.commands.findIndex(cmd => cmd.name === commandName);
    if (index !== -1) {
      const command = this.commands[index];
      this.commands.splice(index, 1);
      this.emit('commandUnregistered', command);
    }
  }

  /**
   * Process text to find and execute commands
   */
  public processText(text: string, confidence: number): { executed: boolean; command?: Command } {
    if (!this.config.enabled || confidence < this.config.minimumConfidence) {
      return { executed: false };
    }

    // Normalize text based on case sensitivity setting
    const normalizedText = this.config.caseSensitive ? text : text.toLowerCase();
    
    // Check if text starts with command prefix
    const prefix = this.config.caseSensitive ? this.config.commandPrefix : this.config.commandPrefix.toLowerCase();
    if (!normalizedText.includes(prefix)) {
      return { executed: false };
    }

    // Extract the command part (after the prefix)
    const commandPart = normalizedText.substring(normalizedText.indexOf(prefix) + prefix.length).trim();
    
    // Find matching command
    const matchedCommand = this.findMatchingCommand(commandPart);
    
    if (matchedCommand) {
      try {
        matchedCommand.execute();
        this.emit('commandExecuted', { command: matchedCommand, text });
        return { executed: true, command: matchedCommand };
      } catch (error) {
        this.emit('commandError', { command: matchedCommand, error });
        return { executed: false, command: matchedCommand };
      }
    }
    
    this.emit('commandNotFound', { text: commandPart });
    return { executed: false };
  }

  /**
   * Find a command that matches the given text
   */
  private findMatchingCommand(text: string): Command | undefined {
    // Direct match
    for (const command of this.commands) {
      for (const trigger of command.triggers) {
        const normalizedTrigger = this.config.caseSensitive ? trigger : trigger.toLowerCase();
        
        if (text === normalizedTrigger) {
          return command;
        }
        
        // Check if text starts with the trigger
        if (text.startsWith(normalizedTrigger + ' ')) {
          return command;
        }
      }
    }
    
    // Fuzzy matching if enabled
    if (this.config.fuzzyMatching) {
      let bestMatch: { command: Command; score: number } | null = null;
      
      for (const command of this.commands) {
        for (const trigger of command.triggers) {
          const normalizedTrigger = this.config.caseSensitive ? trigger : trigger.toLowerCase();
          const score = this.calculateSimilarity(text, normalizedTrigger);
          
          if (score > 0.8 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { command, score };
          }
        }
      }
      
      if (bestMatch) {
        return bestMatch.command;
      }
    }
    
    return undefined;
  }

  /**
   * Calculate similarity between two strings (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;
    
    // Levenshtein distance
    const len1 = str1.length;
    const len2 = str2.length;
    const maxDist = Math.max(len1, len2);
    
    let dist = 0;
    for (let i = 0; i < Math.min(len1, len2); i++) {
      if (str1[i] !== str2[i]) dist++;
    }
    
    dist += Math.abs(len1 - len2);
    
    return 1 - dist / maxDist;
  }

  /**
   * Get all registered commands
   */
  public getCommands(): Command[] {
    return [...this.commands];
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<CommandProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current configuration
   */
  public getConfig(): CommandProcessorConfig {
    return { ...this.config };
  }
} 
// Fastext links and prompt row (REQ-6)

// Fastext configuration - up to 5 links (page numbers 100-899)
export interface FastextConfig {
  red: number | null;
  green: number | null;
  yellow: number | null;
  cyan: number | null;
  index: number | null;
}

// Fastext labels for the prompt row
export interface FastextLabels {
  red: string;
  green: string;
  yellow: string;
  cyan: string;
}

// Fill the prompt row (row 23) with Fastext labels
// Each zone is 10 bytes: 1 colour control byte + up to 9 label bytes
// Colours: red=0x01, green=0x02, yellow=0x03, cyan=0x06
export function fillPromptRow(config: FastextConfig, labels: FastextLabels): Uint8Array {
  const row = new Uint8Array(40);
  row.fill(0x20); // Default to spaces
  
  const zones = [
    { byte: 0x01, label: labels.red },  // red
    { byte: 0x02, label: labels.green }, // green
    { byte: 0x03, label: labels.yellow }, // yellow
    { byte: 0x06, label: labels.cyan }, // cyan
  ];
  
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]!;
    const start = i * 10;
    
    // Write colour control byte
    row[start] = zone.byte;
    
    // Write label text, padded to 9 chars (total 10 bytes including colour byte)
    const labelBytes = zone.label.slice(0, 9).padEnd(9, ' ').split('').map(c => c.charCodeAt(0));
    for (let j = 0; j < labelBytes.length; j++) {
      row[start + 1 + j] = labelBytes[j];
    }
  }
  
  return row;
}

// Handle a Fastext key press
export function handleFastextKey(config: FastextConfig, key: 'red' | 'green' | 'yellow' | 'cyan' | 'index'): number | null {
  if (key === 'red') return config.red;
  if (key === 'green') return config.green;
  if (key === 'yellow') return config.yellow;
  if (key === 'cyan') return config.cyan;
  if (key === 'index') return config.index;
  return null;
}

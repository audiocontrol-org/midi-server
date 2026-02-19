export interface PortInfo {
  id: number
  name: string
  type: 'input' | 'output'
}

export interface MidiClient {
  openPort(portId: string, name: string, type: 'input' | 'output'): Promise<{ success: boolean }>
  closePort(portId: string): Promise<{ success: boolean }>
  getMessages(portId: string): Promise<{ messages: number[][] }>
  sendMessage(portId: string, message: number[]): Promise<{ success: boolean; error?: string }>
  getPorts(): Promise<{ inputs: PortInfo[]; outputs: PortInfo[] }>
  health(): Promise<{ status: string }>
}


# Jarvis — Hub de Casa Inteligente

Hub de automação residencial com controle por **voz e texto em português**, capaz de
ligar/desligar, ajustar volume e controlar mídia em dispositivos de Wi-Fi e Bluetooth
da sua casa (TVs, caixas de som, tomadas, luzes, etc).

## Como funciona (visão geral)

```
Voz/Texto (painel web) ─▶ Intent Parser (PT-BR) ─▶ Command Router ─▶ Device Registry
                                                                          │
                                                                          ▼
                                                              Driver do dispositivo
                                                    (HTTP / MQTT / TP-Link / Roku / Sonos /
                                                     LG WebOS / Samsung Tizen / Bluetooth)
```

- **Intent Parser**: entende comandos como "liga a tv da sala", "aumenta o volume da
  caixa de som", "muta a tv", "coloca o volume em 30".
- **Device Registry**: mantém a lista de dispositivos configurados, seus estados
  (ligado/desligado, volume, etc) e resolve nomes/apelidos/cômodos ditos por voz para
  o dispositivo certo.
- **Drivers**: cada tipo de dispositivo tem um driver com o protocolo real
  correspondente — nada de mock por trás dos panos em produção.
- **API REST + WebSocket**: painel web usa a Web Speech API do navegador (microfone e
  fala) e fala com o backend via HTTP/WebSocket em tempo real.

## Importante: onde isso precisa rodar

Este hub precisa rodar em **uma máquina ligada 24h na mesma rede local da sua casa**
(um Raspberry Pi, um mini-PC, um servidor doméstico). Bluetooth e descoberta de
dispositivos na rede (SSDP/UPnP) só funcionam com acesso físico/de rede real — não
funcionam rodando em nuvem/hospedagem remota sem VPN até a sua casa.

## Dispositivos suportados (drivers já implementados)

| Driver | Dispositivos | Protocolo | Observações |
|---|---|---|---|
| `mock` | Simulado | — | Para testar o sistema sem hardware real |
| `http` | Qualquer dispositivo DIY/ESPHome/Tasmota com API REST | HTTP | Você mapeia as rotas no `devices.json` |
| `mqtt` | Tasmota, Zigbee2MQTT, ESPHome, etc | MQTT | Requer um broker MQTT na rede |
| `tplink-kasa` | Tomadas/interruptores TP-Link Kasa (HS100, HS110, KP...) | TCP proprietário (porta 9999) | Não depende da nuvem TP-Link |
| `roku` | TVs/streamers Roku | ECP (HTTP, porta 8060) | API local oficial da Roku |
| `sonos` | Caixas de som Sonos | UPnP/SOAP (porta 1400) | Play/pause faz o papel de ligar/desligar |
| `lg-webos` | Smart TVs LG (WebOS) | WebSocket SSAP (porta 3000) | 1ª conexão exige aceitar pareamento na TV; ligar usa Wake-on-LAN |
| `samsung-tizen` | Smart TVs Samsung (Tizen, 2016+) | WebSocket (porta 8002, TLS) | 1ª conexão exige aceitar pareamento na TV; ligar usa Wake-on-LAN |
| `bluetooth` | Fones, caixas de som BLE genéricas | Bluetooth LE (GATT) | Requer adaptador BT real + `@abandonware/noble` instalado na máquina |

Adicionar suporte a mais marcas é questão de criar um novo arquivo em `src/drivers/`
implementando a interface `Driver` (veja `src/types.ts`).

## Instalação

```bash
npm install
cp .env.example .env
cp config/devices.example.json config/devices.json
```

Edite `config/devices.json` com os dados reais dos seus aparelhos (IP, MAC, tópicos
MQTT, etc — veja os exemplos comentados no arquivo). Depois:

```bash
npm run dev     # desenvolvimento (recarrega automaticamente)
# ou
npm run build && npm start   # produção
```

Abra `http://localhost:3000` no navegador (Chrome/Edge recomendados por causa da Web
Speech API) — clique no microfone e fale um comando, ou digite no campo de texto.

### Descobrindo dispositivos na rede

O botão **"🔍 Descobrir na rede"** no painel (ou `GET /api/discover`) faz uma busca
SSDP/UPnP na rede local e lista os dispositivos encontrados (Sonos, Roku, várias Smart
TVs, DLNA) com seus IPs — útil para preencher o `devices.json`.

## Comandos de voz/texto suportados

- **Ligar/desligar**: "liga a tv da sala", "desliga o abajur", "acende a luz da cozinha"
- **Volume**: "aumenta o volume", "diminui o volume da caixa de som", "coloca o volume da tv em 30"
- **Mudo**: "muta a tv", "silencia a caixa de som"
- **Mídia**: "toca música na caixa de som", "pausa", "próxima", "anterior"
- **Status**: "qual o status da tv"
- **Grupos**: "liga tudo", "desliga tudo da sala" (usa o campo `room` no `devices.json`)

O parser reconhece variações de conjugação em português (liga/ligue/ligar) e ignora
acentos.

## API

- `GET /api/devices` — lista dispositivos e seus estados
- `POST /api/command` — `{ "text": "liga a tv da sala" }`
- `POST /api/devices/:id/execute` — `{ "action": "power_on", "params": {} }`
- `GET /api/discover` — varredura SSDP/UPnP na rede
- `WS /ws` — snapshot inicial + eventos `{ type: "state", id, state }` em tempo real

## Testes

```bash
npm test        # testes unitários (intent parser, device registry, command router)
npm run typecheck
npm run build
```

## Extensível por design

- Novo tipo de dispositivo → novo driver em `src/drivers/`, implementando `connect`,
  `disconnect`, `getState`, `execute` (veja `src/types.ts`).
- Novos comandos de voz → adicione uma regra em `src/voice/intentParser.ts`.
- Automações (ex: "quando eu chegar em casa, liga tudo") ainda não estão implementadas
  — dá pra construir em cima do `CommandRouter`/`DeviceRegistry` como próximo passo.

## Segurança

- O `devices.json` fica fora do git (`.gitignore`) porque guarda IPs, MACs, tokens e
  chaves de pareamento da sua casa — não versione esse arquivo nem o `.env`.
- O painel web não tem autenticação própria — se for expor além do `localhost`, coloque
  atrás de uma VPN ou de um proxy com login.

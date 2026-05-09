import { useEffect, useRef, useState } from 'react';
import { evaluationApi } from '../../api/client';
import { useChatStore } from '../../store/chatStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { MetricsPanel } from './MetricsPanel';
import { ModelSelector } from './ModelSelector';

const PORT_PROXIMITY_SQ = 20 ** 2; // px² — matches portConnectionStatus.ts threshold

/** Inspect exported metadata JSON for ports with no pipe AND no port-to-port touching connection. */
function findUnconnectedPortsInMetadata(
  metadata: Record<string, unknown>,
): Array<{ elementName: string; portLabel: string }> {
  const elements = (metadata.elements as Record<string, unknown>[] | undefined) ?? [];

  // Build a set of (elementId, portIndex) pairs that are connected via port-to-port proximity
  const touchingPorts = new Set<string>();
  for (let a = 0; a < elements.length; a++) {
    const elA = elements[a];
    const portsA = (elA.ports as Record<string, unknown>[] | undefined) ?? [];
    for (let b = a + 1; b < elements.length; b++) {
      const elB = elements[b];
      const portsB = (elB.ports as Record<string, unknown>[] | undefined) ?? [];
      for (let i = 0; i < portsA.length; i++) {
        const posA = (portsA[i].position as Record<string, number> | undefined) ?? {};
        const ax = posA.canvas_x, ay = posA.canvas_y;
        if (ax == null) continue;
        for (let j = 0; j < portsB.length; j++) {
          const posB = (portsB[j].position as Record<string, number> | undefined) ?? {};
          const bx = posB.canvas_x, by = posB.canvas_y;
          if (bx == null) continue;
          if ((ax - bx) ** 2 + (ay - by) ** 2 <= PORT_PROXIMITY_SQ) {
            touchingPorts.add(`${elA.id as string}:${i}`);
            touchingPorts.add(`${elB.id as string}:${j}`);
          }
        }
      }
    }
  }

  const issues: Array<{ elementName: string; portLabel: string }> = [];
  for (const el of elements) {
    const symbolId = el.symbol_id as string;
    const symbolName = (el.symbol_name as string) ?? symbolId;
    const ports = (el.ports as Record<string, unknown>[] | undefined) ?? [];
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i];
      // Exempt: water_meter upstream inlet (the mains source — no pipe needed)
      if (symbolId === 'water_meter' && port.role === 'upstream') continue;
      const hasPipe = port.connected_pipe_id != null;
      const hasTouching = touchingPorts.has(`${el.id as string}:${i}`);
      if (!hasPipe && !hasTouching) {
        const label = (port.label as string | null) ?? (port.role === 'upstream' ? 'Input' : 'Output');
        issues.push({ elementName: symbolName, portLabel: label });
      }
    }
  }
  return issues;
}

export function ChatWindow() {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Attachment state
  const [hasSchematic, setHasSchematic] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState<string | undefined>();
  const [attachedSchematicJson, setAttachedSchematicJson] = useState<object | null>(null);
  const [hasImage, setHasImage] = useState(false);
  const [attachedImageName, setAttachedImageName] = useState<string | undefined>();
  const [attachedImageFile, setAttachedImageFile] = useState<File | null>(null);

  const {
    messages, isLoading, provider,
    addMessage, setLoading, setLastMetrics, reset,
  } = useChatStore();

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show welcome message on mount
  useEffect(() => {
    reset();
    addMessage({
      role: 'assistant',
      content: 'Upload a schematic JSON file and optionally a JPG, then click **Run Compliance Evaluation** to check Reg 28, supply mode, and MWELS ratings.',
      type: 'info',
    });
  }, []);

  async function handleAttachSchematic(file: File) {
    let parsed: object;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      addMessage({
        role: 'assistant',
        content: `Could not read "${file.name}". Make sure it is a valid schematic JSON file exported from the Draw tab.`,
        type: 'error',
      });
      return;
    }
    setAttachedSchematicJson(parsed);
    setAttachedFileName(file.name);
    setHasSchematic(true);
    addMessage({
      role: 'assistant',
      content: `Schematic "${file.name}" loaded. Click **Run Compliance Evaluation** to check Reg 28, supply mode, and MWELS ratings — or optionally upload the schematic JPG first for an annotated diagram.`,
      type: 'info',
    });
  }

  function handleAttachImage(file: File) {
    setAttachedImageFile(file);
    setAttachedImageName(file.name);
    setHasImage(true);
    addMessage({
      role: 'assistant',
      content: `Image "${file.name}" attached. It will be annotated with check valve and water heater positions.`,
      type: 'info',
    });
  }

  async function handleEvaluate() {
    if (!attachedSchematicJson || isLoading) return;

    const unconnected = findUnconnectedPortsInMetadata(attachedSchematicJson as Record<string, unknown>);
    if (unconnected.length > 0) {
      const list = unconnected.map((u) => `• ${u.elementName} — ${u.portLabel} port`).join('\n');
      addMessage({
        role: 'assistant',
        content: `⚠ **Unconnected ports detected** — hydraulic analysis may be inaccurate.\n\nThe following ports have no pipe connected:\n${list}\n\nConnect all ports before evaluating for correct hydraulic results.`,
        type: 'error',
      });
      return;
    }

    const formData = new FormData();
    formData.append('metadata_json', JSON.stringify(attachedSchematicJson));
    if (attachedImageFile) formData.append('schematic_image', attachedImageFile);
    formData.append('provider', provider);

    setLoading(true);
    addMessage({
      role: 'user',
      content: `Running compliance evaluation on: ${attachedFileName ?? 'schematic'}`,
      type: 'info',
    });

    try {
      const result = await evaluationApi.evaluate(formData);
      addMessage({
        role: 'assistant',
        content: '',
        type: 'answer',
        evaluationResult: result,
      });
      // Always update the right-hand MetricsPanel with whatever the evaluation produced
      {
        const u = result.llm_usage;
        setLastMetrics({
          model: u?.model ?? `${provider} (summary not generated)`,
          provider: u?.provider ?? provider,
          input_tokens: u?.input_tokens ?? 0,
          output_tokens: u?.output_tokens ?? 0,
          cost_usd: u?.cost_usd ?? 0,
          latency_ms: u?.latency_ms ?? 0,
          tokens_per_sec: u ? u.output_tokens / Math.max(u.latency_ms / 1000, 0.001) : 0,
          retrieved_chunks: 0,
          top_similarity: 0,
          mean_similarity: 0,
          faithfulness: 0,
          clarification_turns: 0,
          recap_used: false,
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addMessage({
        role: 'assistant',
        content: `Evaluation failed: ${msg}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* ── Chat area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              Starting session…
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
              Evaluating…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onAttachSchematic={handleAttachSchematic}
          onAttachImage={handleAttachImage}
          onEvaluate={handleEvaluate}
          disabled={isLoading}
          hasSchematic={hasSchematic}
          hasImage={hasImage}
          attachedFileName={attachedFileName}
          attachedImageName={attachedImageName}
        />
      </div>

      {/* ── Right sidebar ── */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          borderLeft: '1px solid #334155',
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <ModelSelector />

        {/* Clear button */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155' }}>
          <button
            onClick={() => {
              setHasSchematic(false);
              setAttachedFileName(undefined);
              setAttachedSchematicJson(null);
              setHasImage(false);
              setAttachedImageName(undefined);
              setAttachedImageFile(null);
              reset();
              addMessage({
                role: 'assistant',
                content: 'Upload a schematic JSON file and optionally a JPG, then click **Run Compliance Evaluation** to check Reg 28, supply mode, and MWELS ratings.',
                type: 'info',
              });
            }}
            style={{
              width: '100%',
              padding: '6px 0',
              borderRadius: 6,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#94a3b8',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>

        <MetricsPanel />
      </div>
    </div>
  );
}

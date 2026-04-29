/**
 * VoiceTurnContent — rich markdown renderer for assistant voice turns.
 * Extracted from VoiceAssistant.tsx.
 */
import { memo, lazy, Suspense } from 'react';
import { splitVoiceResponse } from './voice-utils';

const Markdown = lazy(() => import('react-markdown'));
const DataCard = lazy(() => import('../components/DataCard'));
const remarkGfmPromise = import('remark-gfm').then((m) => m.default);
let remarkGfmPlugin: any = null;
remarkGfmPromise.then((p) => {
  remarkGfmPlugin = p;
});

type VoiceTurnContentProps =
  | {
      text: string;
      role: string;
    }
  | {
      turn: {
        text?: string;
        content?: string;
        role: string;
        spokenText?: string;
      };
    };

export const VoiceTurnContent = memo(function VoiceTurnContent(props: VoiceTurnContentProps) {
  const text = 'turn' in props ? props.turn.text || props.turn.content || '' : props.text;
  const role = 'turn' in props ? props.turn.role : props.role;
  const spokenText = 'turn' in props ? props.turn.spokenText || '' : '';
  if (role === 'user') return <>{text}</>;

  const parts = splitVoiceResponse(text);
  const displaySpoken = spokenText || parts.spokenText || text;
  const referenceText = parts.referenceText;

  if (!referenceText && displaySpoken === text) {
    return (
      <Suspense fallback={<span>{text}</span>}>
        <DataCard content={text} />
        <Markdown
          remarkPlugins={remarkGfmPlugin ? [remarkGfmPlugin] : []}
          components={{
            table({ children }) {
              return (
                <div
                  style={{
                    overflowX: 'auto',
                    margin: '8px 0',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }) {
              return <thead style={{ background: 'rgba(255,255,255,0.06)' }}>{children}</thead>;
            },
            th({ children }) {
              return (
                <th
                  style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.6)',
                    borderBottom: '1px solid rgba(255,255,255,0.1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {children}
                </th>
              );
            },
            td({ children }) {
              return (
                <td
                  style={{
                    padding: '5px 10px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: 'rgba(255,255,255,0.85)',
                    fontFamily: "'SF Mono', monospace",
                    fontSize: 12,
                  }}
                >
                  {children}
                </td>
              );
            },
            strong({ children }) {
              return (
                <strong style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>
                  {children}
                </strong>
              );
            },
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'rgba(96,165,250,0.9)', textDecoration: 'underline' }}
                >
                  {children}
                </a>
              );
            },
            ul({ children }) {
              return (
                <ul style={{ paddingLeft: 16, margin: '4px 0', listStyleType: 'disc' }}>
                  {children}
                </ul>
              );
            },
            ol({ children }) {
              return (
                <ol style={{ paddingLeft: 16, margin: '4px 0', listStyleType: 'decimal' }}>
                  {children}
                </ol>
              );
            },
            li({ children }) {
              return <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>;
            },
            code({ className, children }) {
              const isBlock = Boolean(className) || String(children).includes('\n');
              if (isBlock) {
                return (
                  <pre
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      borderRadius: 6,
                      padding: '8px 10px',
                      margin: '6px 0',
                      overflowX: 'auto',
                      fontSize: 11,
                      lineHeight: 1.4,
                    }}
                  >
                    <code
                      style={{ fontFamily: "'SF Mono', monospace", color: 'rgba(255,255,255,0.8)' }}
                    >
                      {children}
                    </code>
                  </pre>
                );
              }
              return (
                <code
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    padding: '1px 4px',
                    borderRadius: 3,
                    fontSize: '0.9em',
                    fontFamily: "'SF Mono', monospace",
                  }}
                >
                  {children}
                </code>
              );
            },
            p({ children }) {
              return <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{children}</p>;
            },
            h1({ children }) {
              return (
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    margin: '8px 0 4px',
                    color: 'rgba(255,255,255,0.95)',
                  }}
                >
                  {children}
                </div>
              );
            },
            h2({ children }) {
              return (
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    margin: '6px 0 3px',
                    color: 'rgba(255,255,255,0.9)',
                  }}
                >
                  {children}
                </div>
              );
            },
            h3({ children }) {
              return (
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    margin: '4px 0 2px',
                    color: 'rgba(255,255,255,0.85)',
                  }}
                >
                  {children}
                </div>
              );
            },
            hr() {
              return (
                <hr
                  style={{
                    border: 'none',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    margin: '8px 0',
                  }}
                />
              );
            },
          }}
        >
          {text}
        </Markdown>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<span>{text}</span>}>
      <div style={{ display: 'grid', gap: 8 }}>
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 10,
            padding: '10px 12px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.42)',
              marginBottom: 6,
            }}
          >
            Spoken
          </div>
          <DataCard content={displaySpoken} />
          <Markdown
            remarkPlugins={remarkGfmPlugin ? [remarkGfmPlugin] : []}
            components={{
              table({ children }) {
                return (
                  <div
                    style={{
                      overflowX: 'auto',
                      margin: '8px 0',
                      borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      {children}
                    </table>
                  </div>
                );
              },
              thead({ children }) {
                return <thead style={{ background: 'rgba(255,255,255,0.06)' }}>{children}</thead>;
              },
              th({ children }) {
                return (
                  <th
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'rgba(255,255,255,0.6)',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {children}
                  </th>
                );
              },
              td({ children }) {
                return (
                  <td
                    style={{
                      padding: '5px 10px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      color: 'rgba(255,255,255,0.85)',
                      fontFamily: "'SF Mono', monospace",
                      fontSize: 12,
                    }}
                  >
                    {children}
                  </td>
                );
              },
              strong({ children }) {
                return (
                  <strong style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>
                    {children}
                  </strong>
                );
              },
              a({ href, children }) {
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'rgba(96,165,250,0.9)', textDecoration: 'underline' }}
                  >
                    {children}
                  </a>
                );
              },
              ul({ children }) {
                return (
                  <ul style={{ paddingLeft: 16, margin: '4px 0', listStyleType: 'disc' }}>
                    {children}
                  </ul>
                );
              },
              ol({ children }) {
                return (
                  <ol style={{ paddingLeft: 16, margin: '4px 0', listStyleType: 'decimal' }}>
                    {children}
                  </ol>
                );
              },
              li({ children }) {
                return <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>;
              },
              code({ className, children }) {
                const isBlock = Boolean(className) || String(children).includes('\n');
                if (isBlock) {
                  return (
                    <pre
                      style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: 6,
                        padding: '8px 10px',
                        margin: '6px 0',
                        overflowX: 'auto',
                        fontSize: 11,
                        lineHeight: 1.4,
                      }}
                    >
                      <code
                        style={{
                          fontFamily: "'SF Mono', monospace",
                          color: 'rgba(255,255,255,0.8)',
                        }}
                      >
                        {children}
                      </code>
                    </pre>
                  );
                }
                return (
                  <code
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      padding: '1px 4px',
                      borderRadius: 3,
                      fontSize: '0.9em',
                      fontFamily: "'SF Mono', monospace",
                    }}
                  >
                    {children}
                  </code>
                );
              },
              p({ children }) {
                return <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{children}</p>;
              },
              h1({ children }) {
                return (
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      margin: '8px 0 4px',
                      color: 'rgba(255,255,255,0.95)',
                    }}
                  >
                    {children}
                  </div>
                );
              },
              h2({ children }) {
                return (
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      margin: '6px 0 3px',
                      color: 'rgba(255,255,255,0.9)',
                    }}
                  >
                    {children}
                  </div>
                );
              },
              h3({ children }) {
                return (
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      margin: '4px 0 2px',
                      color: 'rgba(255,255,255,0.85)',
                    }}
                  >
                    {children}
                  </div>
                );
              },
              hr() {
                return (
                  <hr
                    style={{
                      border: 'none',
                      borderTop: '1px solid rgba(255,255,255,0.08)',
                      margin: '8px 0',
                    }}
                  />
                );
              },
            }}
          >
            {displaySpoken}
          </Markdown>
        </div>
        {referenceText && (
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'rgba(255,255,255,0.78)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.34)',
                marginBottom: 6,
              }}
            >
              Reference
            </div>
            <Markdown
              remarkPlugins={remarkGfmPlugin ? [remarkGfmPlugin] : []}
              components={{
                table({ children }) {
                  return (
                    <div
                      style={{
                        overflowX: 'auto',
                        margin: '8px 0',
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        {children}
                      </table>
                    </div>
                  );
                },
                thead({ children }) {
                  return <thead style={{ background: 'rgba(255,255,255,0.06)' }}>{children}</thead>;
                },
                th({ children }) {
                  return (
                    <th
                      style={{
                        padding: '6px 10px',
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.6)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {children}
                    </th>
                  );
                },
                td({ children }) {
                  return (
                    <td
                      style={{
                        padding: '5px 10px',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        color: 'rgba(255,255,255,0.85)',
                        fontFamily: "'SF Mono', monospace",
                        fontSize: 12,
                      }}
                    >
                      {children}
                    </td>
                  );
                },
                strong({ children }) {
                  return (
                    <strong style={{ color: 'rgba(255,255,255,0.95)', fontWeight: 600 }}>
                      {children}
                    </strong>
                  );
                },
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'rgba(96,165,250,0.9)', textDecoration: 'underline' }}
                    >
                      {children}
                    </a>
                  );
                },
                ul({ children }) {
                  return (
                    <ul style={{ paddingLeft: 16, margin: '4px 0', listStyleType: 'disc' }}>
                      {children}
                    </ul>
                  );
                },
                ol({ children }) {
                  return (
                    <ol style={{ paddingLeft: 16, margin: '4px 0', listStyleType: 'decimal' }}>
                      {children}
                    </ol>
                  );
                },
                li({ children }) {
                  return <li style={{ marginBottom: 2, lineHeight: 1.5 }}>{children}</li>;
                },
                code({ className, children }) {
                  const isBlock = Boolean(className) || String(children).includes('\n');
                  if (isBlock) {
                    return (
                      <pre
                        style={{
                          background: 'rgba(0,0,0,0.3)',
                          borderRadius: 6,
                          padding: '8px 10px',
                          margin: '6px 0',
                          overflowX: 'auto',
                          fontSize: 11,
                          lineHeight: 1.4,
                        }}
                      >
                        <code
                          style={{
                            fontFamily: "'SF Mono', monospace",
                            color: 'rgba(255,255,255,0.8)',
                          }}
                        >
                          {children}
                        </code>
                      </pre>
                    );
                  }
                  return (
                    <code
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        padding: '1px 4px',
                        borderRadius: 3,
                        fontSize: '0.9em',
                        fontFamily: "'SF Mono', monospace",
                      }}
                    >
                      {children}
                    </code>
                  );
                },
                p({ children }) {
                  return <p style={{ margin: '4px 0', lineHeight: 1.6 }}>{children}</p>;
                },
                h1({ children }) {
                  return (
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        margin: '8px 0 4px',
                        color: 'rgba(255,255,255,0.95)',
                      }}
                    >
                      {children}
                    </div>
                  );
                },
                h2({ children }) {
                  return (
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        margin: '6px 0 3px',
                        color: 'rgba(255,255,255,0.9)',
                      }}
                    >
                      {children}
                    </div>
                  );
                },
                h3({ children }) {
                  return (
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        margin: '4px 0 2px',
                        color: 'rgba(255,255,255,0.85)',
                      }}
                    >
                      {children}
                    </div>
                  );
                },
                hr() {
                  return (
                    <hr
                      style={{
                        border: 'none',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                        margin: '8px 0',
                      }}
                    />
                  );
                },
              }}
            >
              {referenceText}
            </Markdown>
          </div>
        )}
      </div>
    </Suspense>
  );
});

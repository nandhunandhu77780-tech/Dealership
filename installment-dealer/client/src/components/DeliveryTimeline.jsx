import React from 'react';
import { formatIndianDate } from '../utils/formatters.js';

export const STAGES = [
  {
    key: 'Order Placed',
    label: 'Order Placed',
    icon: '📝',
    desc: 'Order received',
    activeColor: '#1d4ed8',
    activeBg: '#eff6ff',
    activeBorder: '#bfdbfe',
  },
  {
    key: 'Approved',
    label: 'Approved',
    icon: '✓',
    desc: 'Approved by admin',
    activeColor: '#0284c7',
    activeBg: '#f0f9ff',
    activeBorder: '#bae6fd',
  },
  {
    key: 'Preparing',
    label: 'Preparing',
    icon: '📦',
    desc: 'Packing & preparing',
    activeColor: '#ea580c',
    activeBg: '#fff7ed',
    activeBorder: '#fed7aa',
  },
  {
    key: 'Out for Delivery',
    label: 'Out for Delivery',
    icon: '🚚',
    desc: 'On the way',
    activeColor: '#7c3aed',
    activeBg: '#f5f3ff',
    activeBorder: '#ddd6fe',
  },
  {
    key: 'Delivered',
    label: 'Delivered',
    icon: '🏠',
    desc: 'Handed over',
    activeColor: '#047857',
    activeBg: '#ecfdf5',
    activeBorder: '#a7f3d0',
  },
];

/**
 * DeliveryTimeline Component
 * Displays a colorful, clear, responsive visual delivery timeline:
 * Order Placed → Approved → Preparing → Out for Delivery → Delivered
 *
 * @param {object} props
 * @param {string} [props.deliveryStatus] - Current delivery status
 * @param {string} [props.orderStatus] - Current order status ('pending'|'approved'|'completed'|'rejected')
 * @param {string|null} [props.expectedDeliveryDate] - Expected delivery date (YYYY-MM-DD or ISO)
 * @param {string} [props.deliveryNote] - Optional delivery note
 * @param {string} [props.deliveredAt] - Optional delivered timestamp
 * @param {string} [props.deliveryUpdatedAt] - Optional last updated timestamp
 * @param {boolean} [props.showDetailsCard=true] - Whether to render the summary details card below the timeline
 */
const DeliveryTimeline = ({
  deliveryStatus,
  orderStatus,
  expectedDeliveryDate,
  deliveryNote,
  deliveredAt,
  deliveryUpdatedAt,
  showDetailsCard = true,
}) => {
  // Resolve current active stage index
  const getCurrentStageIndex = () => {
    if (orderStatus === 'rejected') return -1;

    if (deliveryStatus) {
      const idx = STAGES.findIndex((s) => s.key.toLowerCase() === deliveryStatus.toLowerCase());
      if (idx !== -1) return idx;
    }

    // Fallbacks based on orderStatus
    if (orderStatus === 'completed') return 4; // Delivered
    if (orderStatus === 'approved') return 1; // Approved
    return 0; // Order Placed
  };

  const currentStageIndex = getCurrentStageIndex();
  const isDelivered = currentStageIndex === 4 || deliveryStatus === 'Delivered' || orderStatus === 'completed';
  const isRejected = orderStatus === 'rejected';

  // Get current active stage object
  const currentStage = STAGES[Math.max(0, currentStageIndex)] || STAGES[0];

  return (
    <div
      className="delivery-timeline-wrapper"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '1rem',
        padding: '1.25rem',
        boxShadow: '0 2px 10px rgba(10, 37, 64, 0.04)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1.25rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid #f1f5f9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🚚</span>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: '#0a2540' }}>
              Delivery Timeline
            </h4>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Real-time fulfillment stages &amp; status
            </span>
          </div>
        </div>

        {/* Current Stage Badge */}
        {!isRejected ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '800',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              backgroundColor: currentStage.activeBg,
              color: currentStage.activeColor,
              border: `1px solid ${currentStage.activeBorder}`,
            }}
          >
            <span>{currentStage.icon}</span>
            <span>{isDelivered ? 'Delivered' : `Stage: ${currentStage.label}`}</span>
          </span>
        ) : (
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: '800',
              textTransform: 'uppercase',
              backgroundColor: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
            }}
          >
            ✕ Order Rejected
          </span>
        )}
      </div>

      {/* Visual Stepper Track (Horizontal Progress Bar) */}
      {!isRejected ? (
        <div
          className="timeline-track-container"
          style={{
            overflowX: 'auto',
            paddingBottom: '0.5rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              minWidth: '500px',
              position: 'relative',
              padding: '0.5rem 0.5rem 0',
            }}
          >
            {STAGES.map((stage, idx) => {
              const isPassed = !isDelivered ? idx < currentStageIndex : true;
              const isCurrent = !isDelivered && idx === currentStageIndex;

              // Stage circle colors
              let circleBg = '#f1f5f9';
              let circleColor = '#94a3b8';
              let circleBorder = '#cbd5e1';
              let circleIcon = stage.icon;
              let ringStyle = 'none';

              if (isPassed && !isCurrent) {
                circleBg = '#ecfdf5';
                circleColor = '#047857';
                circleBorder = '#10b981';
                circleIcon = '✓';
              } else if (isCurrent) {
                circleBg = stage.activeBg;
                circleColor = stage.activeColor;
                circleBorder = stage.activeColor;
                ringStyle = `0 0 0 4px ${stage.activeBorder}`;
              } else if (isDelivered && idx === 4) {
                circleBg = '#ecfdf5';
                circleColor = '#047857';
                circleBorder = '#047857';
                circleIcon = '🎉';
                ringStyle = '0 0 0 4px #a7f3d0';
              }

              // Connecting line colors (for stages 0 to 3)
              const lineCompleted = idx < currentStageIndex || isDelivered;

              return (
                <div
                  key={stage.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    flex: 1,
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  {/* Connecting Line to next step */}
                  {idx < STAGES.length - 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '19px',
                        left: '50%',
                        width: '100%',
                        height: '4px',
                        backgroundColor: lineCompleted ? '#10b981' : '#e2e8f0',
                        zIndex: -1,
                        transition: 'background-color 0.25s ease',
                      }}
                    />
                  )}

                  {/* Stage Node Circle */}
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      backgroundColor: circleBg,
                      border: `2px solid ${circleBorder}`,
                      color: circleColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      fontWeight: '800',
                      boxShadow: ringStyle,
                      transition: 'all 0.2s ease',
                      marginBottom: '0.5rem',
                      cursor: 'default',
                    }}
                    title={`${stage.label} - ${stage.desc}`}
                  >
                    <span>{circleIcon}</span>
                  </div>

                  {/* Stage Title */}
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: isCurrent || (isDelivered && idx === 4) ? '800' : '600',
                      color: isCurrent || (isDelivered && idx === 4)
                        ? '#0a2540'
                        : isPassed
                        ? '#047857'
                        : '#64748b',
                      lineHeight: 1.25,
                      maxWidth: '85px',
                    }}
                  >
                    {stage.label}
                  </span>

                  {/* Stage Sub-indicator */}
                  <span
                    style={{
                      fontSize: '0.675rem',
                      color: isCurrent
                        ? stage.activeColor
                        : isPassed
                        ? '#059669'
                        : '#94a3b8',
                      fontWeight: '700',
                      marginTop: '0.2rem',
                    }}
                  >
                    {isCurrent ? 'Current' : isPassed ? 'Done' : 'Pending'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Order Rejected State Callout */
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1rem',
            textAlign: 'center',
            color: '#991b1b',
            fontSize: '0.875rem',
          }}
        >
          <strong>This order was rejected.</strong> Delivery and fulfillment are not active for this order.
        </div>
      )}

      {/* Simple Visual Delivery Timeline (Clean Checklist Format requested by Member) */}
      {!isRejected && (
        <div
          className="simple-delivery-checklist"
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.65rem',
              paddingBottom: '0.45rem',
              borderBottom: '1px solid #edf2f7',
            }}
          >
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: '800',
                color: '#475569',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>📋</span> Delivery Stages
            </span>
            <span
              style={{
                fontSize: '0.725rem',
                fontWeight: '700',
                color: currentStage.activeColor,
              }}
            >
              Current: <strong>{currentStage.label}</strong>
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            {STAGES.map((stage, idx) => {
              const isPassed = !isDelivered ? idx < currentStageIndex : true;
              const isCurrent = !isDelivered && idx === currentStageIndex;
              const symbol = isPassed ? '✓' : '→';

              return (
                <div
                  key={stage.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: isCurrent ? '0.5rem 0.85rem' : '0.35rem 0.65rem',
                    borderRadius: '0.5rem',
                    backgroundColor: isCurrent
                      ? stage.activeBg
                      : isPassed
                      ? '#ffffff'
                      : 'transparent',
                    border: isCurrent
                      ? `2px solid ${stage.activeColor}`
                      : isPassed
                      ? '1px solid #e2e8f0'
                      : '1px dashed #cbd5e1',
                    boxShadow: isCurrent ? `0 2px 8px ${stage.activeBorder}` : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        backgroundColor: isPassed
                          ? '#ecfdf5'
                          : isCurrent
                          ? stage.activeColor
                          : '#f1f5f9',
                        color: isPassed
                          ? '#047857'
                          : isCurrent
                          ? '#ffffff'
                          : '#94a3b8',
                        fontSize: '0.85rem',
                        fontWeight: '900',
                        flexShrink: 0,
                      }}
                    >
                      {symbol}
                    </span>
                    <span
                      style={{
                        fontSize: isCurrent ? '0.925rem' : '0.85rem',
                        fontWeight: isCurrent ? '800' : isPassed ? '700' : '500',
                        color: isCurrent
                          ? stage.activeColor
                          : isPassed
                          ? '#0f172a'
                          : '#64748b',
                      }}
                    >
                      {stage.label}
                    </span>
                  </div>

                  <div>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: '800',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '9999px',
                          backgroundColor: stage.activeColor,
                          color: '#ffffff',
                          letterSpacing: '0.03em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Current Stage
                      </span>
                    )}
                    {isPassed && !isCurrent && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          color: '#059669',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                        }}
                      >
                        ✓ Done
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delivered Celebration Notice */}
      {isDelivered && (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: '0.75rem',
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>🎉</span>
          <div>
            <strong style={{ color: '#065f46', fontSize: '0.9rem', display: 'block' }}>
              Order Delivered Successfully!
            </strong>
            <span style={{ color: '#047857', fontSize: '0.8rem' }}>
              {deliveredAt
                ? `Delivered on ${formatIndianDate(deliveredAt, true)}.`
                : 'The product has been delivered to your delivery address.'}
            </span>
          </div>
        </div>
      )}

      {/* Details Card (Expected Delivery Date, Note, Statuses, Last Updated) */}
      {showDetailsCard && (
        <div
          style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '0.75rem',
            padding: '1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {/* Expected Delivery Date Block */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.6rem',
              padding: '0.75rem 0.9rem',
            }}
          >
            <span
              style={{
                fontSize: '0.725rem',
                color: '#64748b',
                display: 'block',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.25rem',
              }}
            >
              Expected Delivery Date
            </span>

            {isDelivered ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#047857' }}>
                <span style={{ fontSize: '1rem' }}>✓</span>
                <strong style={{ fontSize: '0.9rem', fontWeight: '800' }}>
                  {deliveredAt
                    ? `Delivered on ${formatIndianDate(deliveredAt)}`
                    : expectedDeliveryDate
                    ? `Delivered (${formatIndianDate(expectedDeliveryDate)})`
                    : 'Delivered'}
                </strong>
              </div>
            ) : expectedDeliveryDate ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#0a2540' }}>
                <span style={{ fontSize: '1.05rem', color: '#ea580c' }}>📅</span>
                <strong style={{ fontSize: '0.925rem', fontWeight: '800', color: '#ea580c' }}>
                  {formatIndianDate(expectedDeliveryDate)}
                </strong>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b' }}>
                <span style={{ fontSize: '1rem' }}>⏱</span>
                <span
                  style={{
                    fontSize: '0.85rem',
                    color: '#c2410c',
                    backgroundColor: '#fff7ed',
                    border: '1px solid #fed7aa',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '0.35rem',
                    fontWeight: '700',
                    lineHeight: 1.3,
                  }}
                >
                  Delivery date will be updated soon.
                </span>
              </div>
            )}
          </div>

          {/* Delivery Status Block */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.6rem',
              padding: '0.75rem 0.9rem',
            }}
          >
            <span
              style={{
                fontSize: '0.725rem',
                color: '#64748b',
                display: 'block',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.25rem',
              }}
            >
              Current Delivery Status
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  fontSize: '0.8rem',
                  fontWeight: '800',
                  backgroundColor: isRejected ? '#fef2f2' : currentStage.activeBg,
                  color: isRejected ? '#dc2626' : currentStage.activeColor,
                  border: `1px solid ${isRejected ? '#fecaca' : currentStage.activeBorder}`,
                }}
              >
                <span>{isRejected ? '✕' : currentStage.icon}</span>
                <span>{isRejected ? 'Order Rejected' : currentStage.label}</span>
              </span>
            </div>
          </div>

          {/* Last Updated Date/Time */}
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '0.6rem',
              padding: '0.75rem 0.9rem',
            }}
          >
            <span
              style={{
                fontSize: '0.725rem',
                color: '#64748b',
                display: 'block',
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '0.25rem',
              }}
            >
              Last Updated Date/Time
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#334155' }}>
              <span style={{ fontSize: '0.95rem' }}>🕒</span>
              <strong style={{ fontSize: '0.85rem', fontWeight: '700' }}>
                {deliveryUpdatedAt ? formatIndianDate(deliveryUpdatedAt, true) : 'Recently updated'}
              </strong>
            </div>
          </div>

          {/* Optional Delivery Note Block (Full-width if present) */}
          {deliveryNote && deliveryNote.trim() && (
            <div
              style={{
                gridColumn: '1 / -1',
                backgroundColor: '#fffdfa',
                border: '1px solid #fed7aa',
                borderRadius: '0.6rem',
                padding: '0.75rem 0.9rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.725rem',
                  color: '#9a3412',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontWeight: '800',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.25rem',
                }}
              >
                <span>📝</span> Delivery Note
              </span>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: '#334155',
                  lineHeight: '1.45',
                  fontStyle: 'italic',
                }}
              >
                "{deliveryNote.trim()}"
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * SimpleDeliveryTimeline Component
 * Quick visual checklist for table rows and card summaries:
 * ✓ Order Placed
 * ✓ Approved
 * → Preparing
 * → Out for Delivery
 * → Delivered
 * with current stage clearly highlighted.
 */
export const SimpleDeliveryTimeline = ({ deliveryStatus, orderStatus }) => {
  const isRejected = orderStatus === 'rejected';
  if (isRejected) {
    return (
      <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: '700' }}>
        ✕ Order Rejected
      </span>
    );
  }

  let currentIdx = 0;
  if (deliveryStatus) {
    const idx = STAGES.findIndex((s) => s.key.toLowerCase() === deliveryStatus.toLowerCase());
    if (idx !== -1) currentIdx = idx;
  } else if (orderStatus === 'completed') {
    currentIdx = 4;
  } else if (orderStatus === 'approved') {
    currentIdx = 1;
  }
  const isDelivered = currentIdx === 4 || deliveryStatus === 'Delivered' || orderStatus === 'completed';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        fontSize: '0.725rem',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '0.4rem',
        padding: '0.45rem 0.6rem',
        minWidth: '150px',
      }}
    >
      {STAGES.map((st, idx) => {
        const isPassed = !isDelivered ? idx < currentIdx : true;
        const isCurrent = !isDelivered && idx === currentIdx;
        const symbol = isPassed ? '✓' : '→';

        return (
          <div
            key={st.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.35rem',
              color: isCurrent ? st.activeColor : isPassed ? '#047857' : '#94a3b8',
              fontWeight: isCurrent ? '800' : isPassed ? '700' : '500',
              padding: isCurrent ? '0.15rem 0.35rem' : '0.05rem 0',
              backgroundColor: isCurrent ? st.activeBg : 'transparent',
              borderRadius: isCurrent ? '0.25rem' : '0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontWeight: '900', fontSize: '0.8rem' }}>{symbol}</span>
              <span>{st.label}</span>
            </div>
            {isCurrent && (
              <span
                style={{
                  fontSize: '0.625rem',
                  fontWeight: '800',
                  color: '#ffffff',
                  backgroundColor: st.activeColor,
                  padding: '0.05rem 0.35rem',
                  borderRadius: '9999px',
                }}
              >
                Current
              </span>
            )}
            {isPassed && !isCurrent && (
              <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#059669' }}>
                Done
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DeliveryTimeline;

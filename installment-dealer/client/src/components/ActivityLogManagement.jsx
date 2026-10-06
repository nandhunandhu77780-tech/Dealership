import React, { useState, useEffect, useMemo } from 'react';
import {
  getActivityLogs,
  ACTION_TYPES,
  ACTION_GROUPS,
  getActionBadge,
} from '../services/activityLogService.js';
import { formatINR, formatIndianDate, sanitizeErrorMessage } from '../utils/formatters.js';

const ActivityLogManagement = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [actionGroupFilter, setActionGroupFilter] = useState('all');
  const [specificActionFilter, setSpecificActionFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  const loadLogs = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getActivityLogs({ limitCount: 500 });
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
      setError(sanitizeErrorMessage(err, 'Failed to fetch activity logs.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Group / Specific Action filter
      if (specificActionFilter !== 'all') {
        if (log.actionType !== specificActionFilter) return false;
      } else if (actionGroupFilter !== 'all') {
        if (actionGroupFilter === 'members' && !log.actionType.startsWith('member_')) return false;
        if (actionGroupFilter === 'products' && !log.actionType.startsWith('product_')) return false;
        if (actionGroupFilter === 'orders' && !log.actionType.startsWith('order_')) return false;
        if (actionGroupFilter === 'plans' && !log.actionType.startsWith('plan_')) return false;
        if (actionGroupFilter === 'payments' && !log.actionType.startsWith('payment_')) return false;
      }

      // 2. Date filter (YYYY-MM-DD)
      if (dateFilter) {
        const logDate = (log.createdAt || '').slice(0, 10);
        if (logDate !== dateFilter) return false;
      }

      // 3. Search query (member name, mobile number, member ID/code, product, orderId, admin, details)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const rawDigits = searchQuery.replace(/\D/g, '');
        const matchPhone =
          (log.memberPhone || '').toLowerCase().includes(q) ||
          (rawDigits.length >= 4 && (log.memberPhone || '').replace(/\D/g, '').includes(rawDigits));
        const matchMember =
          (log.memberName || '').toLowerCase().includes(q) ||
          (log.memberId || '').toLowerCase().includes(q) ||
          (log.memberCode || '').toLowerCase().includes(q) ||
          matchPhone;
        const matchAdmin =
          (log.adminName || '').toLowerCase().includes(q) ||
          (log.adminEmail || '').toLowerCase().includes(q);
        const matchAction = (log.action || '').toLowerCase().includes(q);
        const matchDetails = (log.details || '').toLowerCase().includes(q);
        const matchProduct = (log.productName || '').toLowerCase().includes(q);
        const matchOrder = (log.orderId || '').toLowerCase().includes(q);

        if (!matchMember && !matchAdmin && !matchAction && !matchDetails && !matchProduct && !matchOrder) {
          return false;
        }
      }

      return true;
    });
  }, [logs, actionGroupFilter, specificActionFilter, dateFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayLogs = logs.filter((l) => (l.createdAt || '').startsWith(todayStr));
    const paymentLogs = logs.filter((l) => (l.actionType || '').startsWith('payment_'));
    const memberOrderLogs = logs.filter(
      (l) => (l.actionType || '').startsWith('member_') || (l.actionType || '').startsWith('order_')
    );

    return {
      total: logs.length,
      today: todayLogs.length,
      payments: paymentLogs.length,
      memberOrders: memberOrderLogs.length,
    };
  }, [logs]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setActionGroupFilter('all');
    setSpecificActionFilter('all');
    setDateFilter('');
  };

  const formatActivityDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
      {/* Responsive Styles */}
      <style>{`
        .activity-log-table-wrapper {
          display: block;
          overflow-x: auto;
          width: 100%;
        }
        .activity-log-cards-wrapper {
          display: none;
        }
        @media (max-width: 840px) {
          .activity-log-table-wrapper {
            display: none;
          }
          .activity-log-cards-wrapper {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
        }
      `}</style>

      {/* Page Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📜</span>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0a2540', margin: 0, letterSpacing: '-0.02em' }}>
              Activity Log
            </h1>
            <span style={{
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: '700',
            }}>
              {logs.length} Recorded
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.25rem', margin: 0 }}>
            Read-only immutable audit trail of administrative operations, payments, and system updates
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadLogs(true)}
          disabled={loading || refreshing}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.55rem 0.95rem',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '0.5rem',
            color: '#334155',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          <span style={{ display: 'inline-block', transform: refreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.5s ease' }}>
            🔄
          </span>
          <span>{refreshing ? 'Refreshing...' : 'Refresh Logs'}</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
      }}>
        {/* Total Activities */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '0.5rem',
            backgroundColor: '#eff6ff',
            color: '#1d4ed8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            flexShrink: 0,
          }}>
            📋
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Activities
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0a2540', lineHeight: 1.2 }}>
              {metrics.total}
            </div>
          </div>
        </div>

        {/* Today's Actions */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '0.5rem',
            backgroundColor: '#ecfdf5',
            color: '#047857',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            flexShrink: 0,
          }}>
            ⚡
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Today's Actions
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#047857', lineHeight: 1.2 }}>
              {metrics.today}
            </div>
          </div>
        </div>

        {/* Payment Collections */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '0.5rem',
            backgroundColor: '#fff7ed',
            color: '#ea580c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            flexShrink: 0,
          }}>
            💵
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Payments Logged
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#ea580c', lineHeight: 1.2 }}>
              {metrics.payments}
            </div>
          </div>
        </div>

        {/* Member & Order Ops */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '0.5rem',
            backgroundColor: '#f5f3ff',
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            flexShrink: 0,
          }}>
            👥
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Member & Order Ops
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: '800', color: '#7c3aed', lineHeight: 1.2 }}>
              {metrics.memberOrders}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          alignItems: 'center',
        }}>
          {/* Search by Member or Keyword */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#475569', fontWeight: '600', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Search Member / Activity
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '0.9rem' }}>
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Name, Mobile Number, Member ID, Order, Admin..."
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem 0.6rem 2.2rem',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '0.5rem',
                  color: '#0f172a',
                  fontSize: '0.875rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {/* Action Category Filter */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#475569', fontWeight: '600', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Action Category
            </label>
            <select
              value={actionGroupFilter}
              onChange={(e) => {
                setActionGroupFilter(e.target.value);
                setSpecificActionFilter('all');
              }}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
              }}
            >
              {ACTION_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Action Type */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#475569', fontWeight: '600', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Specific Action Type
            </label>
            <select
              value={specificActionFilter}
              onChange={(e) => setSpecificActionFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
              }}
            >
              <option value="all">All Action Types</option>
              {Object.entries(ACTION_TYPES).map(([key, val]) => {
                const b = getActionBadge(val);
                return (
                  <option key={key} value={val}>
                    {b.icon} {b.label}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#475569', fontWeight: '600', marginBottom: '0.35rem', textTransform: 'uppercase' }}>
              Filter by Date
            </label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '0.5rem',
                color: '#0f172a',
                fontSize: '0.875rem',
              }}
            />
          </div>
        </div>

        {/* Active Filters Summary & Reset */}
        {(searchQuery || actionGroupFilter !== 'all' || specificActionFilter !== 'all' || dateFilter) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.75rem',
            borderTop: '1px solid #e2e8f0',
            fontSize: '0.8rem',
            color: '#64748b',
          }}>
            <span>Showing {filteredLogs.length} matching events</span>
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: 'none',
                border: 'none',
                color: '#ea580c',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 1rem' }} />
          <p style={{ margin: 0, fontWeight: '500' }}>Loading system audit logs...</p>
        </div>
      )}

      {/* Error Message */}
      {error && !loading && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.5rem',
          padding: '1rem',
          color: '#b91c1c',
          fontWeight: '500',
        }}>
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredLogs.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1rem',
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>📭</span>
          <h3 style={{ color: '#0a2540', fontSize: '1.1rem', fontWeight: '700', margin: '0 0 0.4rem' }}>
            No activity logs match your criteria
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: '0 auto 1.25rem', maxWidth: '420px' }}>
            Try modifying your search term, changing action filters, or picking a different date range.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: '#ea580c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Log Table for Desktop */}
      {!loading && !error && filteredLogs.length > 0 && (
        <div className="activity-log-table-wrapper" style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
        }}>
          <table
            className="responsive-table"
            style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}
          >
            <thead>
              <tr style={{
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                color: '#475569',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontWeight: '700',
              }}>
                <th style={{ padding: '0.85rem 0.75rem' }}>Date & Time</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Action</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Administrator</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Customer / Target</th>
                <th style={{ padding: '0.85rem 0.75rem' }}>Details</th>
                <th style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => {
                const badge = getActionBadge(log.actionType);
                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      transition: 'background-color 0.15s ease',
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
                  >
                    {/* Timestamp */}
                    <td style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap', color: '#475569', fontSize: '0.8rem' }}>
                      {formatActivityDateTime(log.createdAt)}
                    </td>

                    {/* Action Type Badge */}
                    <td style={{ padding: '0.85rem 0.75rem', whiteSpace: 'nowrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <span>{badge.icon}</span>
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    {/* Admin Name & Email */}
                    <td style={{ padding: '0.85rem 0.75rem' }}>
                      <div style={{ fontWeight: '700', color: '#0a2540' }}>{log.adminName || 'Admin'}</div>
                      {log.adminEmail && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{log.adminEmail}</div>
                      )}
                    </td>

                    {/* Customer / Target */}
                    <td style={{ padding: '0.85rem 0.75rem' }}>
                      {log.memberName ? (
                        <div>
                          <div style={{ fontWeight: '700', color: '#0a2540', fontSize: '0.875rem' }}>{log.memberName}</div>
                          {log.memberPhone && (
                            <div style={{ fontSize: '0.78rem', marginTop: '0.15rem' }}>
                              <a
                                href={`tel:${log.memberPhone}`}
                                style={{
                                  color: '#0284c7',
                                  fontWeight: '600',
                                  textDecoration: 'none',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.2rem',
                                }}
                                title="Click to call customer"
                              >
                                📞 {log.memberPhone}
                              </a>
                            </div>
                          )}
                          {(log.memberCode || log.memberId) && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.15rem' }}>
                              <span style={{ backgroundColor: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                ID: {log.memberCode || log.memberId}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : log.productName ? (
                        <div style={{ fontWeight: '600', color: '#0f172a' }}>{log.productName}</div>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>-</span>
                      )}
                    </td>

                    {/* Detailed Notes */}
                    <td style={{ padding: '0.85rem 0.75rem', color: '#475569', maxWidth: '320px', lineHeight: 1.4 }}>
                      {log.details || log.action || '-'}
                    </td>

                    {/* Amount */}
                    <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {log.amount && parseFloat(log.amount) > 0 ? (
                        <strong style={{ color: '#047857', fontWeight: '800' }}>
                          {formatINR(log.amount)}
                        </strong>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards for Mobile Screen Widths */}
      {!loading && !error && filteredLogs.length > 0 && (
        <div className="activity-log-cards-wrapper">
          {filteredLogs.map((log) => {
            const badge = getActionBadge(log.actionType);
            return (
              <div
                key={log.id}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: badge.bg,
                      color: badge.color,
                      border: `1px solid ${badge.border}`,
                    }}
                  >
                    <span>{badge.icon}</span>
                    <span>{badge.label}</span>
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {formatActivityDateTime(log.createdAt)}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#0a2540' }}>
                    {log.action}
                  </div>
                  {log.memberName && (
                    <div style={{ fontSize: '0.8rem', color: '#0284c7', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#0a2540', fontWeight: '700' }}>👤 {log.memberName}</span>
                      {log.memberPhone && (
                        <a href={`tel:${log.memberPhone}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                          📞 {log.memberPhone}
                        </a>
                      )}
                      {(log.memberCode || log.memberId) && (
                        <span style={{ color: '#64748b', fontSize: '0.72rem' }}>
                          (ID: {log.memberCode || log.memberId})
                        </span>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '0.25rem' }}>
                    {log.details}
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '0.5rem',
                  borderTop: '1px solid #f1f5f9',
                  fontSize: '0.8rem',
                }}>
                  <span style={{ color: '#64748b' }}>
                    By: <strong>{log.adminName}</strong>
                  </span>
                  {log.amount && parseFloat(log.amount) > 0 && (
                    <strong style={{ color: '#047857', fontWeight: '800' }}>
                      {formatINR(log.amount)}
                    </strong>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ActivityLogManagement;

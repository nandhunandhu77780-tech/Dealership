import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getMembers,
  createMember,
  updateMember,
  deleteMember,
  toggleMemberStatus,
} from '../services/memberService.js';
import { logAdminActivity, ACTION_TYPES } from '../services/activityLogService.js';
import MemberModal from './MemberModal.jsx';
import DeleteConfirmModal from './DeleteConfirmModal.jsx';
import MemberNotificationModal from './MemberNotificationModal.jsx';
import { sanitizeErrorMessage, formatIndianDate } from '../utils/formatters.js';

const MemberManagement = ({ onViewMemberDetails = null }) => {
  const { currentUser, userProfile } = useAuth();
  const adminName = userProfile?.name || currentUser?.displayName || 'Administrator';
  const adminEmail = userProfile?.email || currentUser?.email || '';
  const adminId = currentUser?.uid || '';

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'inactive'

  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [selectedMemberForNotifs, setSelectedMemberForNotifs] = useState(null);

  // Alerts
  const [notification, setNotification] = useState(null); // { type: 'success' | 'error', message: string }

  const showNotification = (message, type = 'success') => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await getMembers();
      setMembers(data);
    } catch (err) {
      console.error('Error fetching members:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  // Filtered members list based on search and status
  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const query = searchQuery.toLowerCase().trim();
      const cleanPhoneQuery = query.replace(/\D/g, '');
      const memberCleanPhone = (member.phone || '').replace(/\D/g, '');

      const matchesSearch =
        !query ||
        member.name?.toLowerCase().includes(query) ||
        member.memberId?.toLowerCase().includes(query) ||
        (cleanPhoneQuery && memberCleanPhone.includes(cleanPhoneQuery)) ||
        member.phone?.toLowerCase().includes(query) ||
        member.email?.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'all' || member.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [members, searchQuery, statusFilter]);

  // Open modal for new member
  const handleOpenAdd = () => {
    setSelectedMember(null);
    setIsFormModalOpen(true);
  };

  // Open modal for editing member
  const handleOpenEdit = (member) => {
    setSelectedMember(member);
    setIsFormModalOpen(true);
  };

  // Save member (create or update)
  const handleSaveMember = async (formData) => {
    setActionLoading(true);
    try {
      if (selectedMember) {
        // Update
        await updateMember(selectedMember.id, formData);
        setMembers((prev) =>
          prev.map((m) =>
            m.id === selectedMember.id ? { ...m, ...formData, updatedAt: new Date().toISOString() } : m
          )
        );
        showNotification(`Member ${formData.memberId} updated successfully.`);

        // Safe activity log
        logAdminActivity({
          action: `Updated Member ${formData.memberId || selectedMember.memberId}`,
          actionType: ACTION_TYPES.MEMBER_EDITED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'member',
          targetId: selectedMember.id,
          memberId: formData.memberId || selectedMember.memberId,
          memberName: formData.name || selectedMember.name,
          details: `Updated profile details for member ${formData.name || selectedMember.name} (${formData.memberId || selectedMember.memberId})`,
        });
      } else {
        // Create
        const newMember = await createMember(formData);
        setMembers((prev) => [newMember, ...prev]);
        showNotification(`New member ${newMember.memberId} registered successfully.`);

        // Safe activity log
        logAdminActivity({
          action: `Added New Member ${newMember.memberId}`,
          actionType: ACTION_TYPES.MEMBER_ADDED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'member',
          targetId: newMember.id,
          memberId: newMember.memberId,
          memberName: newMember.name,
          details: `Registered new member ${newMember.name} with business ID ${newMember.memberId}`,
        });
      }
      setIsFormModalOpen(false);
      setSelectedMember(null);
    } catch (err) {
      console.error('Error saving member:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Open delete confirmation
  const handleOpenDelete = (member) => {
    setMemberToDelete(member);
    setIsDeleteModalOpen(true);
  };

  // Confirm delete
  const handleConfirmDelete = async (id) => {
    setActionLoading(true);
    const targetToDelete = memberToDelete || members.find((m) => m.id === id);
    try {
      await deleteMember(id);
      setMembers((prev) => prev.filter((m) => m.id !== id));
      showNotification('Member deleted successfully.');

      // Safe activity log
      if (targetToDelete) {
        logAdminActivity({
          action: `Deleted Member ${targetToDelete.memberId}`,
          actionType: ACTION_TYPES.MEMBER_DELETED,
          adminId,
          adminName,
          adminEmail,
          targetType: 'member',
          targetId: targetToDelete.id,
          memberId: targetToDelete.memberId,
          memberName: targetToDelete.name,
          details: `Deleted member account ${targetToDelete.name} (${targetToDelete.memberId})`,
        });
      }

      setIsDeleteModalOpen(false);
      setMemberToDelete(null);
    } catch (err) {
      console.error('Failed to delete member:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle status
  const handleToggleStatus = async (member) => {
    try {
      const nextStatus = await toggleMemberStatus(member.id, member.status);
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, status: nextStatus } : m))
      );
      showNotification(
        `Member ${member.memberId} is now ${nextStatus.toUpperCase()}.`
      );

      // Safe activity log
      logAdminActivity({
        action: `${nextStatus === 'active' ? 'Activated' : 'Deactivated'} Member ${member.memberId}`,
        actionType: nextStatus === 'active' ? ACTION_TYPES.MEMBER_ACTIVATED : ACTION_TYPES.MEMBER_DEACTIVATED,
        adminId,
        adminName,
        adminEmail,
        targetType: 'member',
        targetId: member.id,
        memberId: member.memberId,
        memberName: member.name,
        status: nextStatus,
        details: `Changed member ${member.name} (${member.memberId}) status from ${member.status} to ${nextStatus}`,
      });
    } catch (err) {
      console.error('Failed to update status:', err);
      showNotification(sanitizeErrorMessage(err), 'error');
    }
  };

  return (
    <section style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '1.25rem',
      padding: '2rem',
      marginTop: '1.5rem',
      boxShadow: '0 4px 20px -2px rgba(10, 37, 64, 0.06)',
    }}>
      <style>{`
        .member-desktop-table {
          display: block;
        }
        .member-mobile-cards {
          display: none;
        }
        @media (max-width: 768px) {
          .member-desktop-table {
            display: none !important;
          }
          .member-mobile-cards {
            display: flex !important;
            flex-direction: column;
            gap: 1rem;
          }
        }
      `}</style>

      {/* Header and Add Member Button */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.75rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Members Management
            </h2>
            <span style={{
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              padding: '0.2rem 0.65rem',
              borderRadius: '9999px',
              fontSize: '0.8rem',
              fontWeight: '700',
            }}>
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginTop: '0.35rem', marginBottom: 0 }}>
            Directory of customer profiles, contacts, and installment commitments
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="btn btn-orange"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1.35rem',
            fontSize: '0.9rem',
          }}
        >
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
          <span>Add Member</span>
        </button>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div style={{
          backgroundColor: notification.type === 'error' ? '#fef2f2' : '#ecfdf5',
          border: `1px solid ${notification.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          color: notification.type === 'error' ? '#b91c1c' : '#047857',
          padding: '0.85rem 1.15rem',
          borderRadius: '0.75rem',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Controls Bar: Search Box and Status Tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem',
        padding: '0.85rem 1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '0.75rem',
        border: '1px solid #e2e8f0',
      }}>
        {/* Search input */}
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <span style={{
            position: 'absolute',
            left: '0.85rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#94a3b8',
            fontSize: '0.95rem',
          }}>
            🔍
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Name, Mobile Number, or Member ID..."
            style={{
              width: '100%',
              padding: '0.65rem 2rem 0.65rem 2.5rem',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '0.55rem',
              color: '#0f172a',
              fontSize: '0.875rem',
              outline: 'none',
            }}
            onFocus={(e) => e.target.style.borderColor = '#ea580c'}
            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.6rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              &times;
            </button>
          )}
        </div>

        {/* Status Filter buttons */}
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {['all', 'active', 'inactive'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '0.45rem',
                border: '1px solid',
                borderColor: statusFilter === status ? '#ea580c' : '#e2e8f0',
                backgroundColor: statusFilter === status ? '#ea580c' : '#ffffff',
                color: statusFilter === status ? '#ffffff' : '#64748b',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.15s ease',
              }}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Live Search & Filter Feedback Banner */}
        {(searchQuery || statusFilter !== 'all') && (
          <div style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.65rem',
            borderTop: '1px solid #e2e8f0',
            fontSize: '0.825rem',
            color: '#64748b',
          }}>
            <span>
              Showing <strong style={{ color: '#ea580c' }}>{filteredMembers.length}</strong> of <strong>{members.length}</strong> registered members
              {searchQuery && <span> matching "<strong>{searchQuery}</strong>"</span>}
              {statusFilter !== 'all' && <span> with status <strong style={{ textTransform: 'capitalize' }}>{statusFilter}</strong></span>}
            </span>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#ea580c',
                fontWeight: '700',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Clear Search &amp; Filters
            </button>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: '4rem 2rem',
          color: '#64748b',
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            border: '3px solid #fed7aa',
            borderTopColor: '#ea580c',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 1rem',
          }} />
          <p style={{ fontWeight: '500' }}>Loading members from Firestore...</p>
        </div>
      ) : filteredMembers.length === 0 ? (
        /* Empty State */
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          backgroundColor: '#f8fafc',
          borderRadius: '0.75rem',
          border: '1px dashed #cbd5e1',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>👥</div>
          <h3 style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '700', marginBottom: '0.4rem' }}>
            {searchQuery ? 'No matching members found' : 'No members registered yet'}
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            {searchQuery
              ? `No members matched "${searchQuery}". Check spelling or clear filters.`
              : 'Add customer profiles to maintain installment agreements, verify contacts, and track payment schedules.'}
          </p>
          {searchQuery ? (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="btn btn-secondary"
              style={{
                padding: '0.55rem 1.15rem',
                fontSize: '0.85rem',
              }}
            >
              Clear Search Filter
            </button>
          ) : (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="btn btn-orange"
              style={{
                padding: '0.65rem 1.4rem',
                fontSize: '0.875rem',
              }}
            >
              + Add First Member
            </button>
          )}
        </div>
      ) : (
        <div>
          {/* Desktop / Tablet Table View */}
          <div className="member-desktop-table table-container" style={{ overflowX: 'auto' }}>
            <table
              className="responsive-table"
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.9rem',
              }}
            >
              <thead>
                <tr style={{
                  borderBottom: '2px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontWeight: '700',
                }}>
                  <th style={{ padding: '0.95rem 1rem' }}>Customer (Name &amp; Mobile)</th>
                  <th style={{ padding: '0.95rem 1rem' }}>Contact &amp; Address</th>
                  <th style={{ padding: '0.95rem 1rem' }}>Account Status</th>
                  <th style={{ padding: '0.95rem 1rem' }}>Join Date</th>
                  <th style={{ padding: '0.95rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => {
                  const isActive = member.status === 'active';
                  const hasPhone = Boolean(member.phone && String(member.phone).trim().length >= 10);
                  return (
                    <tr
                      key={member.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                    >
                      {/* Customer Name (Largest/Most Prominent) & Mobile Number (Below Name) */}
                      <td data-label="Customer" style={{ padding: '1rem' }}>
                        {/* 1. Full Name — largest/most prominent */}
                        <div style={{
                          fontSize: '1.05rem',
                          fontWeight: '800',
                          color: '#0a2540',
                          letterSpacing: '-0.01em',
                          lineHeight: 1.25,
                        }}>
                          {member.name}
                        </div>

                        {/* 2. Mobile Number — clearly visible directly below name */}
                        <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                          {hasPhone ? (
                            <a
                              href={`tel:${member.phone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.25rem 0.65rem',
                                backgroundColor: '#f0fdf4',
                                border: '1.5px solid #86efac',
                                borderRadius: '0.45rem',
                                color: '#065f46',
                                fontSize: '0.9rem',
                                fontWeight: '800',
                                textDecoration: 'none',
                                boxShadow: '0 1px 2px rgba(16, 185, 129, 0.12)',
                              }}
                              title="Primary customer contact (Click to call)"
                            >
                              <span style={{ fontSize: '0.85rem' }}>📞</span>
                              <span>{member.phone}</span>
                            </a>
                          ) : (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              padding: '0.2rem 0.5rem',
                              backgroundColor: '#fef2f2',
                              border: '1px solid #fecaca',
                              borderRadius: '0.35rem',
                              color: '#b91c1c',
                              fontSize: '0.75rem',
                              fontWeight: '700',
                            }}>
                              ⚠️ Missing Mobile
                            </span>
                          )}

                          {/* 3. Member ID — secondary information */}
                          <code style={{
                            padding: '0.2rem 0.5rem',
                            backgroundColor: '#fff7ed',
                            color: '#ea580c',
                            border: '1px solid #fed7aa',
                            borderRadius: '0.35rem',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                          }} title="Secondary identification">
                            ID: {member.memberId || 'N/A'}
                          </code>
                        </div>
                      </td>

                      {/* Email (smaller secondary) & Address */}
                      <td data-label="Contact & Address" style={{ padding: '1rem', maxWidth: '260px' }}>
                        {/* Email — smaller secondary info */}
                        <div style={{ fontSize: '0.8rem', color: '#64748b', wordBreak: 'break-all' }}>
                          ✉️ {member.email || <span style={{ color: '#94a3b8' }}>No email registered</span>}
                        </div>
                        {/* Address */}
                        <div style={{ fontSize: '0.825rem', color: '#334155', marginTop: '0.25rem', lineHeight: 1.35 }}>
                          📍 {member.address || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No address registered</span>}
                        </div>
                      </td>

                      {/* Account Status Badge */}
                      <td data-label="Status" style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.65rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: isActive ? '#ecfdf5' : '#f1f5f9',
                          color: isActive ? '#047857' : '#64748b',
                          border: `1px solid ${isActive ? '#a7f3d0' : '#cbd5e1'}`,
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: isActive ? '#10b981' : '#94a3b8',
                          }} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Join Date */}
                      <td data-label="Join Date" style={{ padding: '1rem', whiteSpace: 'nowrap', color: '#475569', fontSize: '0.825rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>📅</span>
                          <span>{member.createdAt ? formatIndianDate(member.createdAt) : 'N/A'}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td data-label="Actions" style={{ padding: '1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'nowrap' }}>
                          {/* Clear View Details Button */}
                          <button
                            type="button"
                            onClick={() => onViewMemberDetails && onViewMemberDetails(member)}
                            title="View complete member profile, orders, installments, and payment ledger"
                            className="btn btn-orange"
                            style={{
                              padding: '0.38rem 0.75rem',
                              fontSize: '0.775rem',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                            }}
                          >
                            <span>👤</span>
                            <span>View Details</span>
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(member)}
                            title="Edit member details"
                            style={{
                              padding: '0.38rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '0.4rem',
                              border: '1px solid #cbd5e1',
                              backgroundColor: '#ffffff',
                              color: '#334155',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#ffffff')}
                          >
                            <span>✏️</span>
                            <span>Edit</span>
                          </button>

                          {/* Activate / Deactivate button */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(member)}
                            title={isActive ? 'Deactivate member account' : 'Activate member account'}
                            style={{
                              padding: '0.38rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '0.4rem',
                              border: '1px solid',
                              borderColor: isActive ? '#fed7aa' : '#a7f3d0',
                              backgroundColor: isActive ? '#fff7ed' : '#ecfdf5',
                              color: isActive ? '#c2410c' : '#047857',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>

                          {/* Alerts button */}
                          <button
                            type="button"
                            onClick={() => setSelectedMemberForNotifs(member)}
                            title="View member notifications and dues alerts (read-only)"
                            style={{
                              padding: '0.38rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '0.4rem',
                              border: '1px solid #bfdbfe',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#dbeafe')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#eff6ff')}
                          >
                            <span>🔔</span>
                            <span>Alerts</span>
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(member)}
                            title="Delete member"
                            style={{
                              padding: '0.38rem 0.65rem',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                              borderRadius: '0.4rem',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fef2f2',
                              color: '#b91c1c',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
                          >
                            <span>🗑️</span>
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards View (Optimized for Small Screens) */}
          <div className="member-mobile-cards">
            {filteredMembers.map((member) => {
              const isActive = member.status === 'active';
              const hasPhone = Boolean(member.phone && String(member.phone).trim().length >= 10);
              return (
                <div
                  key={member.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderLeft: `5px solid ${isActive ? '#10b981' : '#94a3b8'}`,
                    borderRadius: '0.875rem',
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                    boxShadow: '0 2px 6px rgba(10, 37, 64, 0.04)',
                  }}
                >
                  {/* Card Header: Name + Status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                    <div>
                      {/* Full Name — largest/most prominent */}
                      <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0a2540', lineHeight: 1.25 }}>
                        {member.name}
                      </div>
                      {/* Member ID — secondary information */}
                      <div style={{ marginTop: '0.25rem' }}>
                        <code style={{
                          padding: '0.15rem 0.45rem',
                          backgroundColor: '#fff7ed',
                          color: '#ea580c',
                          border: '1px solid #fed7aa',
                          borderRadius: '0.35rem',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                        }}>
                          ID: {member.memberId || 'N/A'}
                        </code>
                      </div>
                    </div>

                    {/* Account Status Badge */}
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      backgroundColor: isActive ? '#ecfdf5' : '#f1f5f9',
                      color: isActive ? '#047857' : '#64748b',
                      border: `1px solid ${isActive ? '#a7f3d0' : '#cbd5e1'}`,
                      flexShrink: 0,
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: isActive ? '#10b981' : '#94a3b8',
                      }} />
                      {isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Primary Identification Box: Mobile Number */}
                  <div style={{
                    backgroundColor: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '0.65rem',
                    padding: '0.65rem 0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                  }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: '#047857', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                        Primary Mobile Number
                      </span>
                      {hasPhone ? (
                        <a
                          href={`tel:${member.phone}`}
                          style={{
                            fontSize: '1rem',
                            fontWeight: '800',
                            color: '#065f46',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            marginTop: '0.15rem',
                          }}
                        >
                          <span>📞</span>
                          <span>{member.phone}</span>
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.825rem', color: '#b91c1c', fontWeight: '700', marginTop: '0.15rem', display: 'block' }}>
                          ⚠️ Missing Mobile
                        </span>
                      )}
                    </div>
                    {hasPhone && (
                      <a
                        href={`tel:${member.phone}`}
                        style={{
                          padding: '0.35rem 0.75rem',
                          backgroundColor: '#059669',
                          color: '#ffffff',
                          borderRadius: '0.45rem',
                          fontSize: '0.8rem',
                          fontWeight: '700',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          boxShadow: '0 1px 2px rgba(5, 150, 105, 0.2)',
                        }}
                      >
                        <span>Call</span>
                      </a>
                    )}
                  </div>

                  {/* Contact & Location Details */}
                  <div style={{ fontSize: '0.825rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {/* Email — smaller secondary info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#64748b' }}>
                      <span>✉️</span>
                      <span style={{ wordBreak: 'break-all' }}>{member.email || 'No email registered'}</span>
                    </div>

                    {/* Address */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                      <span style={{ flexShrink: 0 }}>📍</span>
                      <span style={{ color: '#334155' }}>
                        {member.address || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No address registered</span>}
                      </span>
                    </div>

                    {/* Join Date */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b', fontSize: '0.78rem' }}>
                      <span>📅</span>
                      <span>Joined: {member.createdAt ? formatIndianDate(member.createdAt) : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid #f1f5f9',
                  }}>
                    {/* Prominent View Details Button */}
                    <button
                      type="button"
                      onClick={() => onViewMemberDetails && onViewMemberDetails(member)}
                      className="btn btn-orange"
                      style={{
                        width: '100%',
                        justifyContent: 'center',
                        padding: '0.65rem 1rem',
                        fontSize: '0.875rem',
                        fontWeight: '700',
                      }}
                    >
                      <span>👤</span>
                      <span>View Details &amp; Installments</span>
                    </button>

                    {/* Secondary Actions in a Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(member)}
                        style={{
                          padding: '0.45rem 0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          borderRadius: '0.4rem',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          color: '#334155',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleStatus(member)}
                        style={{
                          padding: '0.45rem 0.25rem',
                          fontSize: '0.725rem',
                          fontWeight: '600',
                          borderRadius: '0.4rem',
                          border: '1px solid',
                          borderColor: isActive ? '#fed7aa' : '#a7f3d0',
                          backgroundColor: isActive ? '#fff7ed' : '#ecfdf5',
                          color: isActive ? '#c2410c' : '#047857',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        {isActive ? 'Deact' : 'Act'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedMemberForNotifs(member)}
                        style={{
                          padding: '0.45rem 0.25rem',
                          fontSize: '0.725rem',
                          fontWeight: '600',
                          borderRadius: '0.4rem',
                          border: '1px solid #bfdbfe',
                          backgroundColor: '#eff6ff',
                          color: '#1d4ed8',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        Alerts
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenDelete(member)}
                        style={{
                          padding: '0.45rem 0.25rem',
                          fontSize: '0.725rem',
                          fontWeight: '600',
                          borderRadius: '0.4rem',
                          border: '1px solid #fecaca',
                          backgroundColor: '#fef2f2',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modals */}
      <MemberModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setSelectedMember(null); }}
        onSave={handleSaveMember}
        member={selectedMember}
        loading={actionLoading}
      />

      <DeleteConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setMemberToDelete(null); }}
        onConfirm={handleConfirmDelete}
        member={memberToDelete}
        loading={actionLoading}
      />

      {/* Read-Only Member Notification Status Modal for Admin */}
      <MemberNotificationModal
        isOpen={Boolean(selectedMemberForNotifs)}
        onClose={() => setSelectedMemberForNotifs(null)}
        member={selectedMemberForNotifs}
      />
    </section>
  );
};

export default MemberManagement;

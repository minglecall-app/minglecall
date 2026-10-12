/**
 * Client API for Admin Control Center office RBAC.
 */

import { authFetch } from '../utils/apiClient';
import type { OfficeFeatureDef } from '../../shared/officeRbac/features';

const BASE = '/api/admin/office-rbac';

export type OfficeRoleDto = {
  id: string;
  key: string;
  label: string;
  description: string;
  isSuper: boolean;
  isSystem: boolean;
  permissions: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type OfficeUserDto = {
  id: string;
  name: string | null;
  email: string | null;
  role: 'admin';
  officeRoleId: string | null;
  officeRoleKey: string | null;
  officeRoleLabel: string;
  isSuper: boolean;
  isBanned?: boolean;
  createdAt?: string | null;
};

export type OfficeRbacMe = {
  isSuper: boolean;
  permissions: string[];
  officeRoleId: string | null;
  role: OfficeRoleDto | null;
  features: OfficeFeatureDef[];
};

type ApiResult<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string; code?: string };
  message?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await authFetch(`${BASE}${path}`, init);
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok || json?.success === false) {
      const errObj = json?.error;
      const message =
        (typeof errObj === 'string' ? errObj : errObj?.message) ||
        json?.message ||
        (res.status === 404
          ? 'Office RBAC API not found. Restart the local server (npm run dev) so /api/admin/office-rbac is registered.'
          : null) ||
        res.statusText ||
        'Request failed';
      return {
        success: false,
        error: {
          message,
          code: typeof errObj === 'object' ? errObj?.code : undefined,
        },
      };
    }
    if (json?.data == null) {
      return {
        success: false,
        error: {
          message:
            'Empty office RBAC response. Restart the server and apply the OFFICE RBAC block in supabase_schema.sql.',
          code: 'EMPTY_RESPONSE',
        },
      };
    }
    return { success: true, data: json.data as T, message: json.message };
  } catch (err: any) {
    return { success: false, error: { message: err?.message || 'Network error' } };
  }
}

export function fetchOfficeRbacMe() {
  return request<OfficeRbacMe>('/me');
}

export function fetchOfficeFeatures() {
  return request<{ features: OfficeFeatureDef[] }>('/features');
}

export function fetchOfficeRoles() {
  return request<{ roles: OfficeRoleDto[]; features: OfficeFeatureDef[] }>('/roles');
}

export function createOfficeRole(body: {
  label: string;
  key?: string;
  description?: string;
  permissions?: string[];
}) {
  return request<{ role: OfficeRoleDto }>('/roles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateOfficeRole(
  roleId: string,
  body: { label?: string; description?: string; permissions?: string[] }
) {
  return request<{ role: OfficeRoleDto }>(`/roles/${encodeURIComponent(roleId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deleteOfficeRole(roleId: string) {
  return request<{ deleted: boolean }>(`/roles/${encodeURIComponent(roleId)}`, {
    method: 'DELETE',
  });
}

export function fetchOfficeUsers() {
  return request<{ users: OfficeUserDto[] }>('/users');
}

export function createOfficeUser(body: {
  name: string;
  email: string;
  password: string;
  officeRoleId: string;
}) {
  return request<{ user: OfficeUserDto }>('/users', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function assignOfficeUserRole(userId: string, officeRoleId: string | null) {
  return request<{ userId: string; officeRoleId: string | null }>(
    `/users/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ officeRoleId }),
    }
  );
}

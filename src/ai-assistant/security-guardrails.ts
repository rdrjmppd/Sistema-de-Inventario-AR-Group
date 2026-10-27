/**
 * Security Guardrails & RBAC Enforcement Engine for Chrystal AI Assistant (PolarBot)
 * Protects operational boundaries, prevents privilege escalation and enforces zero-hallucination.
 * Official Copyright: © 2026 AR Group. Todos los derechos de desarrollo reservados.
 */

import { UserRole } from '../types';
import { LiveErpOperationalContext } from './types';

export interface GuardrailCheckResult {
  isBlocked: boolean;
  blockReason?: 'RBAC_PRIVILEGE_VIOLATION' | 'UNAUTHORIZED_DATA_MODIFICATION' | 'OUT_OF_SCOPE';
  responseMessage?: string;
}

const SUPERADMIN_RESTRICTED_KEYWORDS = [
  'reiniciar sistema',
  'reinicio de fabrica',
  'factory wipe',
  'borrar base de datos',
  'eliminar base de datos',
  'wipe db',
  'resetear sistema',
  'cambiar pin de superadmin',
  'restaurar backup cifrado',
];

const GERENTE_RESTRICTED_KEYWORDS = [
  'autorizar baja',
  'autorizar descarga',
  'aprobar baja',
  'aprobar bajas',
  'aprobar merma',
  'firmar baja',
  'eliminar sede',
  'eliminar sedes',
  'eliminar deposito',
  'eliminar depositos',
  'crear sede',
  'crear deposito',
  'cerrar mes contable',
  'sellar cierre contable',
];

const WRITE_ATTEMPT_KEYWORDS = [
  'modifica el producto',
  'cambia el stock',
  'aumenta el precio',
  'borra este sku',
  'inserta en la base de datos',
  'escribe en firestore',
  'cambia el pin',
];

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function evaluateSecurityGuardrails(
  query: string,
  liveContext: LiveErpOperationalContext
): GuardrailCheckResult {
  const q = normalizeText(query);
  const role = liveContext.activeUser.role;

  // 1. Guardrail against direct database mutation requests (Read-Only Mode)
  for (const kw of WRITE_ATTEMPT_KEYWORDS) {
    if (q.includes(normalizeText(kw))) {
      return {
        isBlocked: true,
        blockReason: 'UNAUTHORIZED_DATA_MODIFICATION',
        responseMessage:
          'Opero exclusivamente en modo consultivo (solo lectura). No tengo permisos técnicos para modificar, crear ni borrar registros directamente en la base de datos. Para realizar ese ajuste, ingresa al módulo correspondiente en el menú lateral y utiliza los formularios oficiales del sistema.',
      };
    }
  }

  // 2. Guardrail for Superadmin-only operations (Factory Wipe / DB Reset)
  if (role !== UserRole.SUPERADMIN) {
    for (const kw of SUPERADMIN_RESTRICTED_KEYWORDS) {
      if (q.includes(normalizeText(kw))) {
        return {
          isBlocked: true,
          blockReason: 'RBAC_PRIVILEGE_VIOLATION',
          responseMessage:
            'Por directrices de seguridad RBAC de la empresa, esa operación está reservada exclusivamente para el rol SUPERADMINISTRADOR o GERENTE. Como tu cuenta posee nivel operativo, debes canalizar esta solicitud formalmente con la Gerencia de Operaciones o Dirección General.',
        };
      }
    }
  }

  // 3. Guardrail for Gerente + Superadmin operations (Approve Discards / Delete Locations)
  if (role !== UserRole.SUPERADMIN && role !== UserRole.GERENTE) {
    for (const kw of GERENTE_RESTRICTED_KEYWORDS) {
      if (q.includes(normalizeText(kw))) {
        return {
          isBlocked: true,
          blockReason: 'RBAC_PRIVILEGE_VIOLATION',
          responseMessage:
            'Por directrices de seguridad RBAC de la empresa, esa operación está reservada exclusivamente para el rol SUPERADMINISTRADOR o GERENTE. Como tu cuenta posee nivel operativo, debes canalizar esta solicitud formalmente con la Gerencia de Operaciones o Dirección General.',
        };
      }
    }
  }

  return { isBlocked: false };
}

export function buildOutOfScopeResponse(_query: string, _userName: string): string {
  return `Esa consulta no forma parte de la información operativa de Chrystal® ERP (Chrystal® Enterprise Food Retail ERP) y no dispongo de una fuente confirmable para responderte. Te sugiero consultar el departamento o fuente externa correspondiente. Dentro del sistema puedo orientarte en existencias de productos, tasa oficial BCV, solicitud de bajas y registro de mercancía.`;
}

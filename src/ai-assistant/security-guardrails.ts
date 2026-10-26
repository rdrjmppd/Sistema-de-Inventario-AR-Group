/**
 * Security Guardrails & RBAC Enforcement Engine for Chrystal AI Assistant
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
  'aprobar merma',
  'firmar baja',
  'eliminar sede',
  'eliminar deposito',
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
  const userName = liveContext.activeUser.displayName;

  // 1. Guardrail against direct database mutation requests
  for (const kw of WRITE_ATTEMPT_KEYWORDS) {
    if (q.includes(normalizeText(kw))) {
      return {
        isBlocked: true,
        blockReason: 'UNAUTHORIZED_DATA_MODIFICATION',
        responseMessage: `Hola ${userName}. Como asistente de inteligencia artificial opero bajo perfil estrictamente consultivo (solo lectura); no tengo potestad técnica para modificar, insertar o borrar registros directamente en la base de datos. Para realizar esa modificación, por favor ingresa al módulo correspondiente en el menú lateral y utiliza los formularios oficiales.`,
      };
    }
  }

  // 2. Guardrail for Superadmin-only operations
  if (role !== UserRole.SUPERADMIN) {
    for (const kw of SUPERADMIN_RESTRICTED_KEYWORDS) {
      if (q.includes(normalizeText(kw))) {
        return {
          isBlocked: true,
          blockReason: 'RBAC_PRIVILEGE_VIOLATION',
          responseMessage: `Estimado ${userName}, la operación consultada (Reinicio Total de Fábrica / Restauración Maestra) está reservada exclusivamente para el rol de **SUPERADMINISTRADOR**. Como tu cuenta posee nivel de seguridad **${role}**, por estrictas directrices de gobernanza RBAC y prevención de riesgos operacionales no puedo proporcionarte instrucciones de ejecución. Te sugiero canalizar este requerimiento con la Dirección General o el Administrador de Sistemas de la empresa.`,
        };
      }
    }
  }

  // 3. Guardrail for Gerente + Superadmin operations
  if (role !== UserRole.SUPERADMIN && role !== UserRole.GERENTE) {
    for (const kw of GERENTE_RESTRICTED_KEYWORDS) {
      if (q.includes(normalizeText(kw))) {
        return {
          isBlocked: true,
          blockReason: 'RBAC_PRIVILEGE_VIOLATION',
          responseMessage: `Hola ${userName}. Las funciones de **Autorización Definitiva de Bajas/Descargas de Inventario**, creación/eliminación de Sedes y Cierre Contable Mensual requieren nivel de autorización **GERENTE** o **SUPERADMIN**. Como tu rol actual es **${role}**, tienes habilitado el pre-registro de solicitudes de descarga, pero la firma y confirmación final debe ser ejecutada por la Gerencia de Operaciones mediante su PIN personal confidencial.`,
        };
      }
    }
  }

  return { isBlocked: false };
}

export function buildOutOfScopeResponse(query: string, userName: string): string {
  return `Comprendo tu inquietud, ${userName}, pero esa consulta no forma parte de la información operativa ni de las funciones de **Chrystal® Enterprise Food Retail ERP**. No dispongo de una fuente confirmable dentro de la plataforma para darte una respuesta certera.

Te recomiendo consultar la fuente especializada correspondiente o el departamento administrativo pertinente. 

Dentro del sistema, con total certeza y en tiempo real puedo asistirte en:
* Consultar existencias físicas de productos por sede y alertas de quiebre de stock.
* Conocer la tasa oficial activa del BCV y su valor tras el corte de las 5:00 PM.
* Guiarte paso a paso para dar de alta productos (SKUs), cargar comprobantes OCR o solicitar bajas de mercancía.
* Revisar el estado de compras y pedidos sugeridos a proveedores.`;
}

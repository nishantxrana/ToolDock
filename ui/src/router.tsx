import { createElement, lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { RequireConnection } from '@/components/common/RequireConnection';
import { HomePage } from '@/features/home/HomePage';
import { ConnectPage } from '@/features/connection/ConnectPage';
import { TOOLS, DEFAULT_TOOL_PATH } from '@/features/tools/registry';
import { MIGRATIONS } from '@/features/migrate/registry';
import { DesktopOnly } from '@/features/migrate/components/Wizard';
import { Lazy } from '@/components/common/Lazy';

const MigrateHome = lazy(() => import('@/features/migrate/MigrateHome'));

/** Routes are generated from the tool and migration registries. */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'connect', element: <ConnectPage /> },
      ...TOOLS.map((tool) => ({
        path: tool.path.replace(/^\//, ''),
        element: tool.requiresConnection ? (
          <RequireConnection>{createElement(tool.component)}</RequireConnection>
        ) : (
          createElement(tool.component)
        ),
      })),
      {
        path: 'migrate',
        element: (
          <Lazy>
            <MigrateHome />
          </Lazy>
        ),
      },
      ...MIGRATIONS.map((m) => ({
        path: m.path.replace(/^\//, ''),
        element: (
          <DesktopOnly>
            <Lazy>{createElement(m.component)}</Lazy>
          </DesktopOnly>
        ),
      })),
      { path: '*', element: <Navigate to={DEFAULT_TOOL_PATH} replace /> },
    ],
  },
]);

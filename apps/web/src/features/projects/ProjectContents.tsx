import {
  Dialog,
  ErrorState,
  LoadingState,
  Toast,
  type ToastKind,
} from '@mergecom/ui';
import {
  Archive,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  Grid2X2,
  List,
  Pencil,
  Presentation,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import {
  type Document,
  type DocumentKind,
  type Folder as ProjectFolder,
  type ProjectRole,
  useArchiveDocumentMutation,
  useCreateDocumentMutation,
  useCreateFolderMutation,
  useDeleteDocumentMutation,
  useDeleteFolderMutation,
  useDocumentsQuery,
  useFolderPathQuery,
  useFoldersQuery,
  useUpdateDocumentMutation,
  useUpdateFolderMutation,
} from '../../api/queries';
import type { CurrentUser } from '../../auth/session';
import { readFormString } from '../../services/contact';

const documentIcons: Record<DocumentKind, typeof FileText> = {
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  word_document: FileText,
};
const kindLabels: Record<DocumentKind, string> = {
  presentation: 'Presentation',
  spreadsheet: 'Spreadsheet',
  word_document: 'Word document',
};
const dateFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface ProjectContentsProps {
  accessRole: ProjectRole;
  folderId: string | null;
  projectId: string;
  user: CurrentUser;
}

type RenameTarget =
  | { kind: 'document'; value: Document }
  | { kind: 'folder'; value: ProjectFolder };
type DeleteTarget = RenameTarget;

export function ProjectContents({
  accessRole,
  folderId,
  projectId,
  user,
}: ProjectContentsProps) {
  const organizationId = user.activeOrganization?.id;
  const folders = useFoldersQuery(organizationId, projectId, folderId);
  const [archived, setArchived] = useState(false);
  const documents = useDocumentsQuery(
    organizationId,
    projectId,
    folderId,
    archived,
  );
  const path = useFolderPathQuery(organizationId, projectId, folderId);
  const createFolder = useCreateFolderMutation(user);
  const createDocument = useCreateDocumentMutation(user);
  const updateFolder = useUpdateFolderMutation(user);
  const updateDocument = useUpdateDocumentMutation(user);
  const archiveDocument = useArchiveDocumentMutation(user);
  const deleteFolder = useDeleteFolderMutation(user);
  const deleteDocument = useDeleteDocumentMutation(user);
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [createType, setCreateType] = useState<'document' | 'folder' | null>(
    null,
  );
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [toast, setToast] = useState<{
    kind: ToastKind;
    message: string;
  } | null>(null);
  const canWrite =
    accessRole === 'project_lead' || accessRole === 'contributor';

  function report(error: unknown, fallback: string) {
    setToast({
      kind: 'error',
      message: error instanceof Error ? error.message : fallback,
    });
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      if (createType === 'folder') {
        await createFolder.mutateAsync({
          name: readFormString(form, 'name'),
          parentFolderId: folderId,
          projectId,
        });
        setToast({ kind: 'success', message: 'Folder created.' });
      } else {
        await createDocument.mutateAsync({
          folderId,
          kind: readFormString(form, 'kind') as DocumentKind,
          name: readFormString(form, 'name'),
          projectId,
        });
        setToast({ kind: 'success', message: 'Document record created.' });
      }
      setCreateType(null);
    } catch (error) {
      report(error, 'Creation failed.');
    }
  }

  async function submitRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTarget) return;
    const name = readFormString(new FormData(event.currentTarget), 'name');
    try {
      if (renameTarget.kind === 'folder') {
        await updateFolder.mutateAsync({
          expectedUpdatedAt: renameTarget.value.updatedAt,
          folderId: renameTarget.value.id,
          name,
          projectId,
        });
      } else {
        await updateDocument.mutateAsync({
          documentId: renameTarget.value.id,
          expectedUpdatedAt: renameTarget.value.updatedAt,
          name,
          projectId,
        });
      }
      setRenameTarget(null);
      setToast({ kind: 'success', message: 'Name updated.' });
    } catch (error) {
      report(error, 'Rename failed.');
    }
  }

  async function moveToRoot(target: RenameTarget) {
    try {
      if (target.kind === 'folder') {
        await updateFolder.mutateAsync({
          expectedUpdatedAt: target.value.updatedAt,
          folderId: target.value.id,
          parentFolderId: null,
          projectId,
        });
      } else {
        await updateDocument.mutateAsync({
          documentId: target.value.id,
          expectedUpdatedAt: target.value.updatedAt,
          folderId: null,
          projectId,
        });
      }
      setToast({ kind: 'success', message: 'Item moved to the project root.' });
    } catch (error) {
      report(error, 'Move failed.');
    }
  }

  async function changeDocumentArchive(document: Document) {
    try {
      await archiveDocument.mutateAsync({
        archived: !document.archivedAt,
        documentId: document.id,
        expectedUpdatedAt: document.updatedAt,
        projectId,
      });
      setToast({
        kind: 'success',
        message: document.archivedAt
          ? 'Document restored.'
          : 'Document archived.',
      });
    } catch (error) {
      report(error, 'Archive state could not be changed.');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'folder') {
        await deleteFolder.mutateAsync({
          expectedUpdatedAt: deleteTarget.value.updatedAt,
          folderId: deleteTarget.value.id,
          projectId,
        });
      } else {
        await deleteDocument.mutateAsync({
          documentId: deleteTarget.value.id,
          expectedUpdatedAt: deleteTarget.value.updatedAt,
          projectId,
        });
      }
      setDeleteTarget(null);
      setToast({ kind: 'success', message: 'Item deleted.' });
    } catch (error) {
      report(error, 'Delete failed.');
    }
  }

  if (
    folders.isLoading ||
    documents.isLoading ||
    (folderId && path.isLoading)
  ) {
    return <LoadingState label="Loading project contents" />;
  }
  if (folders.isError || documents.isError || path.isError) {
    return (
      <ErrorState
        message="Project contents could not be loaded."
        onRetry={() => {
          void folders.refetch();
          void documents.refetch();
          void path.refetch();
        }}
      />
    );
  }

  const folderItems = folders.data?.items ?? [];
  const documentItems = documents.data?.items ?? [];
  const itemClass =
    view === 'grid'
      ? 'flex min-h-40 flex-col justify-between border border-slate-200 bg-white p-4'
      : 'flex min-h-20 items-center gap-4 border-b border-slate-200 bg-white p-4 last:border-b-0';

  return (
    <div>
      <nav
        aria-label="Folder breadcrumb"
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <Link
          className="font-semibold text-red-700 hover:underline"
          to={`/app/projects/${projectId}`}
        >
          Project root
        </Link>
        {path.data?.map((folder) => (
          <span className="flex items-center gap-2" key={folder.id}>
            <span className="text-slate-400">/</span>
            <Link
              className="font-semibold text-slate-700 hover:text-red-700"
              to={`/app/projects/${projectId}/folders/${folder.id}`}
            >
              {folder.name}
            </Link>
          </span>
        ))}
      </nav>
      <div className="mt-5 flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-fit border border-slate-300 bg-white p-1">
          {[
            { label: 'Current', value: false },
            { label: 'Archived documents', value: true },
          ].map((option) => (
            <button
              className={`px-3 py-1.5 text-sm font-semibold ${archived === option.value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              key={option.label}
              type="button"
              onClick={() => setArchived(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {canWrite && !archived ? (
            <>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setCreateType('folder')}
              >
                <FolderPlus aria-hidden="true" size={17} />
                Folder
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={() => setCreateType('document')}
              >
                <FileText aria-hidden="true" size={17} />
                Document
              </button>
            </>
          ) : null}
          <div className="flex border border-slate-300 bg-white p-1">
            <button
              aria-label="Grid view"
              className={`rounded p-1.5 ${view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              title="Grid view"
              type="button"
              onClick={() => setView('grid')}
            >
              <Grid2X2 aria-hidden="true" size={18} />
            </button>
            <button
              aria-label="List view"
              className={`rounded p-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              title="List view"
              type="button"
              onClick={() => setView('list')}
            >
              <List aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </div>
      {folderItems.length || documentItems.length ? (
        <div
          className={
            view === 'grid'
              ? 'mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3'
              : 'mt-5 border border-slate-200'
          }
        >
          {!archived
            ? folderItems.map((folder) => (
                <article className={itemClass} key={folder.id}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center bg-amber-50 text-amber-700">
                      <Folder aria-hidden="true" size={21} />
                    </span>
                    <Link
                      className="truncate font-semibold text-slate-950 hover:text-red-700"
                      to={`/app/projects/${projectId}/folders/${folder.id}`}
                    >
                      {folder.name}
                    </Link>
                  </div>
                  {canWrite ? (
                    <div className="mt-3 flex justify-end gap-1">
                      {folderId ? (
                        <button
                          aria-label={`Move ${folder.name} to root`}
                          className="rounded p-2 text-slate-600 hover:bg-slate-100"
                          title="Move to root"
                          type="button"
                          onClick={() =>
                            void moveToRoot({ kind: 'folder', value: folder })
                          }
                        >
                          <FolderInput aria-hidden="true" size={17} />
                        </button>
                      ) : null}
                      <button
                        aria-label={`Rename ${folder.name}`}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100"
                        title="Rename folder"
                        type="button"
                        onClick={() =>
                          setRenameTarget({ kind: 'folder', value: folder })
                        }
                      >
                        <Pencil aria-hidden="true" size={17} />
                      </button>
                      <button
                        aria-label={`Delete ${folder.name}`}
                        className="rounded p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
                        title="Delete folder"
                        type="button"
                        onClick={() =>
                          setDeleteTarget({ kind: 'folder', value: folder })
                        }
                      >
                        <Trash2 aria-hidden="true" size={17} />
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            : null}
          {documentItems.map((document) => {
            const Icon = documentIcons[document.kind];
            return (
              <article className={itemClass} key={document.id}>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center bg-red-50 text-red-700">
                    <Icon aria-hidden="true" size={21} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      className="block truncate font-semibold text-slate-950 hover:text-red-700"
                      to={`/app/projects/${projectId}/documents/${document.id}/history`}
                    >
                      {document.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {kindLabels[document.kind]} ·{' '}
                      {dateFormatter.format(new Date(document.updatedAt))}
                    </p>
                  </div>
                </div>
                {canWrite ? (
                  <div className="mt-3 flex justify-end gap-1">
                    {folderId && !archived ? (
                      <button
                        aria-label={`Move ${document.name} to root`}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100"
                        title="Move to root"
                        type="button"
                        onClick={() =>
                          void moveToRoot({ kind: 'document', value: document })
                        }
                      >
                        <FolderInput aria-hidden="true" size={17} />
                      </button>
                    ) : null}
                    {!archived ? (
                      <button
                        aria-label={`Rename ${document.name}`}
                        className="rounded p-2 text-slate-600 hover:bg-slate-100"
                        title="Rename document"
                        type="button"
                        onClick={() =>
                          setRenameTarget({ kind: 'document', value: document })
                        }
                      >
                        <Pencil aria-hidden="true" size={17} />
                      </button>
                    ) : null}
                    <button
                      aria-label={
                        document.archivedAt
                          ? `Restore ${document.name}`
                          : `Archive ${document.name}`
                      }
                      className="rounded p-2 text-slate-600 hover:bg-slate-100"
                      title={
                        document.archivedAt
                          ? 'Restore document'
                          : 'Archive document'
                      }
                      type="button"
                      onClick={() => void changeDocumentArchive(document)}
                    >
                      {document.archivedAt ? (
                        <RotateCcw aria-hidden="true" size={17} />
                      ) : (
                        <Archive aria-hidden="true" size={17} />
                      )}
                    </button>
                    <button
                      aria-label={`Delete ${document.name}`}
                      className="rounded p-2 text-slate-600 hover:bg-red-50 hover:text-red-700"
                      title="Delete document"
                      type="button"
                      onClick={() =>
                        setDeleteTarget({ kind: 'document', value: document })
                      }
                    >
                      <Trash2 aria-hidden="true" size={17} />
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="mt-8 border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {archived
            ? 'No archived documents in this folder.'
            : 'This folder is empty.'}
        </p>
      )}
      <Dialog
        description={
          createType === 'folder'
            ? 'Add a nested folder at the current location.'
            : 'Create document metadata. File upload and versions begin in Phase 4.'
        }
        onClose={() => setCreateType(null)}
        open={Boolean(createType)}
        title={createType === 'folder' ? 'Create folder' : 'Create document'}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitCreate(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Name
            <input
              className="field mt-1"
              maxLength={255}
              name="name"
              required
            />
          </label>
          {createType === 'document' ? (
            <label className="block text-sm font-semibold text-slate-800">
              Document type
              <select
                className="field mt-1"
                defaultValue="word_document"
                name="kind"
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setCreateType(null)}
            >
              Cancel
            </button>
            <button className="button-primary" type="submit">
              Create
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        description="The current update timestamp is used to prevent overwriting another user's rename."
        onClose={() => setRenameTarget(null)}
        open={Boolean(renameTarget)}
        title="Rename item"
      >
        <form
          className="space-y-4"
          onSubmit={(event) => void submitRename(event)}
        >
          <label className="block text-sm font-semibold text-slate-800">
            Name
            <input
              className="field mt-1"
              defaultValue={renameTarget?.value.name}
              maxLength={255}
              name="name"
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              className="button-secondary"
              type="button"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </button>
            <button className="button-primary" type="submit">
              Save
            </button>
          </div>
        </form>
      </Dialog>
      <Dialog
        description={
          deleteTarget?.kind === 'folder'
            ? 'Only empty folders can be deleted.'
            : 'The document record is soft-deleted and retained for audit history.'
        }
        onClose={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.value.name ?? 'item'}?`}
      >
        <div className="flex justify-end gap-2">
          <button
            className="button-secondary"
            type="button"
            onClick={() => setDeleteTarget(null)}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            type="button"
            onClick={() => void confirmDelete()}
          >
            Delete
          </button>
        </div>
      </Dialog>
      {toast ? <Toast kind={toast.kind} message={toast.message} /> : null}
    </div>
  );
}

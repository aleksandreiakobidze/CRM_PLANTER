import { ComposePanel } from "@/components/compose-panel";
import { CustomerFileField } from "@/components/customer-file-field";
import { FileText } from "@/components/icons";
import { addCustomerFilesAction, deleteCustomerFileAction } from "@/server/actions/work-actions";
import { formatDateOnly } from "@/server/time";

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} ბ`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} კბ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} მბ`;
}

type FileRow = {
  id: string;
  kind: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: Date;
};

export function CustomerFilesTab({
  customerId,
  canWrite,
  files,
}: {
  customerId: string;
  canWrite: boolean;
  files: FileRow[];
}) {
  const contracts = files.filter((file) => file.kind === "contract");
  const images = files.filter((file) => file.kind === "image");
  return (
    <div className="card doc-card tasks-panel">
      <div>
        <h2 className="doc-title">ფაილები</h2>
        <p className="muted">ხელშეკრულება Word/PDF და სურათები</p>
      </div>
      {canWrite ? (
        <div className="file-launchers">
          <ComposePanel
            buttonLabel="ხელშეკრულება"
            submitLabel="ატვირთვა"
            action={addCustomerFilesAction.bind(null, customerId, "contract")}
          >
            <CustomerFileField accept=".pdf,.doc,.docx" hint="PDF ან Word" />
          </ComposePanel>
          <ComposePanel
            buttonLabel="სურათი"
            submitLabel="ატვირთვა"
            variant="secondary"
            action={addCustomerFilesAction.bind(null, customerId, "image")}
          >
            <CustomerFileField accept=".png,.jpg,.jpeg,.webp,.gif" hint="PNG, JPG, WEBP ან GIF" />
          </ComposePanel>
        </div>
      ) : null}
      <section className="file-block">
        <h3>ხელშეკრულებები</h3>
        {contracts.length === 0 ? <p className="muted">ხელშეკრულება ჯერ არ არის.</p> : null}
        <ul className="file-docs">
          {contracts.map((file) => (
            <li key={file.id} className="file-doc">
              <FileText size={18} />
              <div>
                <a href={`/crm/customers/files/${file.id}`}>{file.fileName}</a>
                <small>{fileSize(file.byteSize)} · {formatDateOnly(file.createdAt)}</small>
              </div>
              {canWrite ? (
                <form action={deleteCustomerFileAction.bind(null, customerId, file.id)}>
                  <button className="secondary" type="submit">წაშლა</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section className="file-block">
        <h3>სურათები</h3>
        {images.length === 0 ? <p className="muted">სურათი ჯერ არ არის.</p> : null}
        <ul className="file-gallery">
          {images.map((file) => (
            <li key={file.id} className="file-tile">
              <a href={`/crm/customers/files/${file.id}`} className="file-thumb">
                <img src={`/crm/customers/files/${file.id}`} alt={file.fileName} />
              </a>
              <div className="file-tile-meta">
                <a href={`/crm/customers/files/${file.id}`}>{file.fileName}</a>
                <small>{fileSize(file.byteSize)}</small>
              </div>
              {canWrite ? (
                <form action={deleteCustomerFileAction.bind(null, customerId, file.id)}>
                  <button className="secondary" type="submit">წაშლა</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

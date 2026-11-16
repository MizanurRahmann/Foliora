import type { AppError } from "../../../../api/error";
import type { CapacityDetails } from "../../../../api/shelves";

function slotLabel(start: number, span: number) {
  return span > 1 ? `slots ${start}\u2013${start + span - 1}` : `slot ${start}`;
}

function isCapacityDetails(details: unknown): details is CapacityDetails {
  return typeof details === "object" && details !== null && Array.isArray((details as CapacityDetails).items);
}

function ErrorNotice({ error }: { error: AppError }) {
  const blocking =
    error.code === "CAPACITY_TOO_SMALL" && isCapacityDetails(error.details) ? error.details.items : [];

  return (
    <div className="manage-shelves__error" role="alert">
      <p>{error.message}</p>
      {blocking.length > 0 && (
        <ul>
          {blocking.map((item) => (
            <li key={item.id}>
              {item.title ?? "Decoration"} ({slotLabel(item.start, item.span)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ErrorNotice;

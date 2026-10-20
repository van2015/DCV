import { memberKey, type MemberModel, type Visibility } from "@dcv/shared";
import type { Node, NodeProps } from "@xyflow/react";
import type { ClassNodeData } from "../projection.js";
import type { OverlayStatus } from "../overlay.js";
import { ChangeBadge } from "../ChangeBadge.js";

const VISIBILITY_MARKERS: Record<Visibility, string> = {
  public: "+",
  protected: "#",
  private: "-"
};

export type ClassFlowNode = Node<ClassNodeData, "class">;

export function ClassNode({ data }: NodeProps<ClassFlowNode>) {
  return <ClassNodeCard data={data} />;
}

export interface ClassNodeCardProps {
  data: ClassNodeData;
  change?: OverlayStatus | null;
  memberChanges?: Map<string, OverlayStatus>;
  ghost?: boolean;
  showMembers?: boolean;
}

export function ClassNodeCard({
  data,
  change,
  memberChanges,
  ghost = false,
  showMembers = true
}: ClassNodeCardProps) {
  const { declaration, stereotype } = data;
  const classes = [
    "uml-node",
    "uml-class",
    change ? `change-${change.status}` : "",
    ghost ? "ghost" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const label = ghost
    ? `${stereotype} ${declaration.name} (eliminado)`
    : `${stereotype} ${declaration.name}`;

  return (
    <article className={classes} aria-label={label}>
      <header className="uml-node-header">
        <span className="uml-stereotype">«{stereotype}»</span>
        <strong>
          {declaration.name}
          {change && <ChangeBadge status={change} />}
        </strong>
      </header>
      {showMembers && (
        <div className="uml-compartment uml-members">
          {declaration.members.length === 0 ? (
            <span className="uml-empty">Sin miembros</span>
          ) : (
            declaration.members.map((member, index) => (
              <MemberLine
                key={`${member.name}-${index}`}
                member={member}
                status={memberChanges?.get(memberKey(member))}
              />
            ))
          )}
        </div>
      )}
      <footer className="uml-node-footer">{declaration.path}</footer>
    </article>
  );
}

function MemberLine({
  member,
  status
}: {
  member: MemberModel;
  status?: OverlayStatus;
}) {
  const classes = [
    "uml-member",
    member.static ? "is-static" : "",
    member.abstract ? "is-abstract" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const text = member.signature ?? memberText(member);
  return (
    <span className={classes} title={`${member.visibility} ${member.kind}`}>
      <span className="uml-visibility">{VISIBILITY_MARKERS[member.visibility]}</span>
      <span>{text}</span>
      {status && <ChangeBadge status={status} />}
    </span>
  );
}

function memberText(member: MemberModel): string {
  const base = member.type ? `${member.name}: ${member.type}` : member.name;
  return member.optional ? `${base}?` : base;
}

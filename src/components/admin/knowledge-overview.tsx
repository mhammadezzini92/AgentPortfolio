import Link from "next/link";
import { requireAdminSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  type EntitySourceLink,
  getProfile,
  listEntitySourceLinks,
  listExperiencesWithSources,
  listProjectsWithSources,
} from "@/services/knowledge/entity-repository";

const heading = "text-sm font-semibold uppercase tracking-wide text-zinc-500";
const card = "rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800";

function Sources({ links }: { links: EntitySourceLink[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-900">
      {links.map((link) => (
        <li key={link.sourceId}>
          <Link href={`/admin/sources/${link.sourceId}`} className="font-medium hover:underline">
            {link.sourceTitle ?? link.sourceUrl ?? `Source #${link.sourceId}`}
          </Link>
          {link.evidence && <> — “{link.evidence}”</>}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <p>
      <span className="text-zinc-500">{label}: </span>
      {value}
    </p>
  );
}

export async function KnowledgeOverview() {
  await requireAdminSession();
  const [profile, profileLinks, experiences, projects] = await Promise.all([
    getProfile(db),
    listEntitySourceLinks("profile"),
    listExperiencesWithSources(),
    listProjectsWithSources(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h2 className={heading}>Profile</h2>
        {profile ? (
          <div className={card}>
            <p className="text-base font-semibold">{profile.fullName}</p>
            <Field label="Title" value={profile.title} />
            <Field label="Location" value={profile.location} />
            <Field label="Summary" value={profile.professionalSummary} />
            <Field label="Skills" value={profile.skills.join(", ")} />
            <Field label="Languages" value={profile.languages.map((l) => (l.proficiency ? `${l.name} (${l.proficiency})` : l.name)).join(", ")} />
            <Field label="Education" value={profile.education.map((e) => [e.degree, e.field, e.institution].filter(Boolean).join(", ")).join(" · ")} />
            <Field label="Contact" value={Object.values(profile.contactInformation).filter(Boolean).join(" · ")} />
            <Sources links={profileLinks.get(1) ?? []} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No profile yet. It is filled from a CV once one is processed.</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Experience ({experiences.length})</h2>
        {experiences.map((experience) => (
          <div key={experience.id} className={card}>
            <p className="font-semibold">{experience.position} · {experience.company}</p>
            <p className="text-xs text-zinc-500">{experience.startDate ?? "?"} – {experience.endDate ?? "present"}</p>
            <Field label="Description" value={experience.description} />
            {experience.responsibilities.length > 0 && (
              <ul className="ml-4 list-disc">{experience.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
            )}
            <Field label="Technologies" value={experience.technologies.join(", ")} />
            <Sources links={experience.sources} />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Projects ({projects.length})</h2>
        {projects.map((project) => (
          <div key={project.id} className={card}>
            <p className="font-semibold">{project.name}</p>
            <Field label="Description" value={project.description} />
            <Field label="Role" value={project.role} />
            <Field label="Architecture" value={project.architecture} />
            <Field label="Technologies" value={project.technologies.join(", ")} />
            <Field label="Challenges" value={project.challenges} />
            <Field label="Solutions" value={project.solutions} />
            <Field label="Achievements" value={project.achievements} />
            <Sources links={project.sources} />
          </div>
        ))}
      </section>
    </div>
  );
}

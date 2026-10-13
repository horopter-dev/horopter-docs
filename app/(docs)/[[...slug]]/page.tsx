import { DocsBody, DocsDescription, DocsPage, DocsTitle } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import { Lockup } from "#components/lockup.tsx";
import { getMDXComponents } from "#components/mdx.tsx";
import { fileRelative } from "#lib/links.ts";
import { source } from "#lib/source.ts";

type SourcePage = (typeof source)["$inferPage"];

function isLanding(page: SourcePage): boolean {
  return page.slugs.length === 0;
}

function pageLink(page: SourcePage) {
  const RelativeLink = createRelativeLink(source, page);
  return function PageLink({ href, ...props }: ComponentProps<"a">) {
    return <RelativeLink href={href && fileRelative(href)} {...props} />;
  };
}

export default async function Page(props: PageProps<"/[[...slug]]">) {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full ?? false}>
      <DocsTitle>
        {isLanding(page) ? <Lockup className="h-16 w-auto" /> : page.data.title}
      </DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={getMDXComponents({ a: pageLink(page) })} />
      </DocsBody>
    </DocsPage>
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const { slug } = await props.params;
  const page = source.getPage(slug);
  if (!page) notFound();

  return {
    title: isLanding(page) ? { absolute: page.data.title } : page.data.title,
    description: page.data.description ?? null,
  };
}

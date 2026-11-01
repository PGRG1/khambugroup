import { PageBani, type BaniFinding } from '@/components/kit/PageBani';

/** People pages use the shared Bani card. */
export function PeopleFindings({findings}:{findings:BaniFinding[]}) {
  return <PageBani findings={findings}/>;
}

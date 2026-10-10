import {requirePortal} from '@/lib/application-access';
import ProductApplication from '@/components/ProductApplication';
export const dynamic='force-dynamic';
export default async function Page(){await requirePortal('worker');return <ProductApplication role="worker" view="overview"/>;}
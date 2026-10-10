import {requirePortal} from '@/lib/application-access';
import ProductApplication from '@/components/ProductApplication';
export const dynamic='force-dynamic';
export default async function Page(){await requirePortal('verifier');return <ProductApplication role="verifier" view="overview"/>;}
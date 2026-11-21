import { PageHead } from '../components/ui';
import MasterData from '../components/MasterData';

/** Stock → Product Setup: product groups, categories, brands, warranty periods and selling units. */
export default function ProductSetup() {
  return (
    <>
      <PageHead title="Product setup" sub="Product groups, categories, brands, warranty periods and selling units used when adding products." />
      <MasterData />
    </>
  );
}

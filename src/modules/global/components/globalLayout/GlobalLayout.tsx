import Shelf from "../../../shelf/components/shelf/Shelf";
import "./GlobalLayout.scss"

function GlobalLayout() {
  return (
    <section className="global-layout">
      <Shelf />
      <Shelf />
      <Shelf />
    </section>
  );
}

export default GlobalLayout;
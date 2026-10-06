import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { toSyncedProperty } from "./propstack.ts";
import type { PropstackUnit } from "./propstack.ts";

const soldHouse: PropstackUnit = {
  id: 1001,
  title: { label: "Titel", value: "Einfamilienhaus mit Garten" },
  street: "Musterweg",
  house_number: "4",
  zip_code: "12345",
  city: "Musterstadt",
  property_status: { id: 7, name: "Verkauft" },
  marketing_type: "BUY",
  rs_type: "HOUSE",
  object_type: "LIVING",
  price: { label: "Kaufpreis", value: 575000.0 },
  sold_price: { label: "Realisierter Preis", value: "560000" },
  sold_date: "2026-09-08T00:00:00.000+02:00",
  living_space: { label: "Wohnfläche", value: 140.5 },
  plot_area: { label: "Grundstück", value: null },
  number_of_rooms: { label: "Zimmer", value: 5.5 },
  courtage: { label: "Käuferprovision", value: "3,57% (inkl. MwSt.)" },
  broker_id: 42,
  broker: { name: "", first_name: "Erika", last_name: "Beispiel", email: "erika@example.com" },
  relationships: [
    { internal_name: "owner", client_id: 501 },
    { internal_name: "partner", client_id: 502 },
    { internal_name: "owner", client_id: null },
  ],
  archived: false,
  updated_at: "2026-09-10T12:00:00.000+02:00",
};

describe("property", () => {
  test("keeps the CRM id and builds a stable code, the name and the address", () => {
    const property = toSyncedProperty(soldHouse);
    assert.equal(property.external_id, "1001");
    assert.equal(property.code, "CRM-1001");
    assert.equal(property.name, "Einfamilienhaus mit Garten");
    assert.equal(property.address, "Musterweg 4, 12345 Musterstadt");
  });

  test("falls back to the street when there is no title", () => {
    const unit = { ...soldHouse, title: { label: "Titel", value: null } };
    assert.equal(toSyncedProperty(unit).name, "Musterweg 4, Musterstadt");
  });

  test("falls back to the code when there is nothing else", () => {
    const property = toSyncedProperty({ id: 7 });
    assert.equal(property.name, "CRM-7");
    assert.equal(property.address, null);
  });

  test("maps status, prices, areas, broker and parties onto the one row", () => {
    const property = toSyncedProperty(soldHouse);
    assert.deepEqual(
      {
        crm_status: property.crm_status,
        crm_status_id: property.crm_status_id,
        marketing_type: property.marketing_type,
        property_type: property.property_type,
        usage_type: property.usage_type,
        asking_price: property.asking_price,
        sold_price: property.sold_price,
        sold_on: property.sold_on,
        living_space: property.living_space,
        plot_area: property.plot_area,
        room_count: property.room_count,
        commission_note: property.commission_note,
        broker_external_id: property.broker_external_id,
        broker_name: property.broker_name,
        broker_email: property.broker_email,
        parties: property.parties,
        archived_in_crm: property.archived_in_crm,
        crm_updated_at: property.crm_updated_at,
      },
      {
        crm_status: "Verkauft",
        crm_status_id: "7",
        marketing_type: "BUY",
        property_type: "HOUSE",
        usage_type: "LIVING",
        asking_price: 575000,
        sold_price: 560000,
        sold_on: "2026-09-08",
        living_space: 140.5,
        plot_area: null,
        room_count: 5.5,
        commission_note: "3,57% (inkl. MwSt.)",
        broker_external_id: "42",
        broker_name: "Erika Beispiel",
        broker_email: "erika@example.com",
        parties: [
          { role: "owner", external_id: "501" },
          { role: "partner", external_id: "502" },
        ],
        archived_in_crm: false,
        crm_updated_at: "2026-09-10T12:00:00.000+02:00",
      },
    );
  });

  test("keeps the whole record, including fields nobody mapped", () => {
    const record = {
      ...soldHouse,
      some_new_field: { label: "Neu", value: 1 },
      images: [{ url: "a" }],
    };
    assert.deepEqual(toSyncedProperty(record as PropstackUnit).crm_data, record);
  });

  test("a property with no status, broker or links maps to empty values", () => {
    const property = toSyncedProperty({ id: 9, property_status: null, broker: null });
    assert.equal(property.crm_status, null);
    assert.equal(property.broker_name, null);
    assert.deepEqual(property.parties, []);
    assert.equal(property.archived_in_crm, false);
  });
});
